// @flow

'use strict';

const _ = require('lodash');

const db = require('../database');
const utils = require('../utils');
const slugify = require('../slugify');
const plugins = require('../plugins');
const analytics = require('../analytics');
const user = require('../user');
const meta = require('../meta');
const posts = require('../posts');
const privileges = require('../privileges');
const categories = require('../categories');
const translator = require('../translator');
const flagContent = require('../posts/flagContent');

module.exports = function (Topics: any): any {
	Topics.create = async function (data: any): Promise<string> {
		// This is an internal method, consider using Topics.post instead
		const timestamp: number = data.timestamp || Date.now();

		const tid: number = await db.incrObjectField('global', 'nextTid');

		let topicData: {
			tid: number;
			uid: number;
			cid: ?number;
			mainPid: number;
			title: string;
			slug: string;
			timestamp: number;
			lastposttime: number;
			postcount: number;
			viewcount: number;
			tags: ?string;
		} = {
			tid: tid,
			uid: data.uid,
			cid: data.cid,
			mainPid: 0,
			title: data.title,
			slug: `${tid}/${slugify(data.title) || 'topic'}`,
			timestamp: timestamp,
			lastposttime: 0,
			postcount: 0,
			viewcount: 0,
			tags: undefined,
		};

		if (Array.isArray(data.tags) && data.tags.length) {
			topicData.tags = data.tags.join(',');
		}

		const result: any = await plugins.hooks.fire('filter:topic.create', { topic: topicData, data: data });
		topicData = result.topic;
		await db.setObject(`topic:${topicData.tid}`, topicData);

		const timestampedSortedSetKeys: string[] = [
			'topics:tid',
			`cid:${topicData.cid}:tids`,
			`cid:${topicData.cid}:tids:create`,
			`cid:${topicData.cid}:uid:${topicData.uid}:tids`,
		];

		const scheduled: boolean = timestamp > Date.now();
		if (scheduled) {
			timestampedSortedSetKeys.push('topics:scheduled');
		}

		await Promise.all([
			db.sortedSetsAdd(timestampedSortedSetKeys, timestamp, topicData.tid),
			db.sortedSetsAdd([
				'topics:views', 'topics:posts', 'topics:votes',
				`cid:${topicData.cid}:tids:votes`,
				`cid:${topicData.cid}:tids:posts`,
				`cid:${topicData.cid}:tids:views`,
			], 0, topicData.tid),
			user.addTopicIdToUser(topicData.uid, topicData.tid, timestamp),
			db.incrObjectField(`category:${topicData.cid}`, 'topic_count'),
			db.incrObjectField('global', 'topicCount'),
			Topics.createTags(data.tags, topicData.tid, timestamp),
			scheduled ? Promise.resolve() : categories.updateRecentTid(topicData.cid, topicData.tid),
		]);
		if (scheduled) {
			await Topics.scheduled.pin(tid, topicData);
		}

		plugins.hooks.fire('action:topic.save', { topic: _.clone(topicData), data: data });
		return topicData.tid;
	};

	Topics.post = async function (data: any): Promise<{
		topicData: any;
		postData: any;
	}> {
		data = await plugins.hooks.fire('filter:topic.post', data);
		const { uid }: { uid: number; } = data;

		const [categoryExists, canCreate, canTag, isAdmin]: boolean[] = await Promise.all([
			categories.exists(data.cid),
			privileges.categories.can('topics:create', data.cid, uid),
			privileges.categories.can('topics:tag', data.cid, uid),
			privileges.users.isAdministrator(uid),
		]);

		data.title = String(data.title).trim();
		data.tags = data.tags || [];
		data.content = String(data.content || '').trimEnd();
		if (!isAdmin) {
			Topics.checkTitle(data.title);
		}

		await Topics.validateTags(data.tags, data.cid, uid);
		data.tags = await Topics.filterTags(data.tags, data.cid);
		if (!data.fromQueue && !isAdmin) {
			Topics.checkContent(data.content);
			if (!await posts.canUserPostContentWithLinks(uid, data.content)) {
				throw new Error(`[[error:not-enough-reputation-to-post-links, ${meta.config['min:rep:post-links']}]]`);
			}
		}

		if (!categoryExists) {
			throw new Error('[[error:no-category]]');
		}

		if (!canCreate || (!canTag && data.tags.length)) {
			throw new Error('[[error:no-privileges]]');
		}

		await guestHandleValid(data);
		if (!data.fromQueue) {
			await user.isReadyToPost(uid, data.cid);
		}

		const tid: number = await Topics.create(data);

		let postData: any = data;
		postData.tid = tid;
		postData.ip = data.req ? data.req.ip : null;
		postData.isMain = true;
		postData = await posts.create(postData);
		postData = await onNewPost(postData, data);

		const [settings, topics]: any[] = await Promise.all([
			user.getSettings(uid),
			Topics.getTopicsByTids([postData.tid], uid),
		]);

		if (!Array.isArray(topics) || !topics.length) {
			throw new Error('[[error:no-topic]]');
		}

		if (uid > 0 && settings.followTopicsOnCreate) {
			await Topics.follow(postData.tid, uid);
		}
		const topicData: any = topics[0];
		topicData.unreplied = true;
		topicData.mainPost = postData;
		topicData.index = 0;
		postData.index = 0;

		if (topicData.scheduled) {
			await Topics.delete(tid);
		}

		analytics.increment(['topics', `topics:byCid:${topicData.cid}`]);
		plugins.hooks.fire('action:topic.post', { topic: topicData, post: postData, data: data });

		if (parseInt(uid, 10) && !topicData.scheduled) {
			user.notifications.sendTopicNotificationToFollowers(uid, topicData, postData);
			Topics.notifyTagFollowers(postData, uid);
			categories.notifyCategoryFollowers(postData, uid);
		}

		return {
			topicData: topicData,
			postData: postData,
		};
	};

	Topics.reply = async function (data: any): Promise<any> {
		data = await plugins.hooks.fire('filter:topic.reply', data);
		const { tid }: { tid: number; } = data;
		const { uid }: { uid: number; } = data;

		const [topicData, isAdmin]: any[] = await Promise.all([
			Topics.getTopicData(tid),
			privileges.users.isAdministrator(uid),
		]);

		await canReply(data, topicData);

		data.cid = topicData.cid;

		await guestHandleValid(data);
		data.content = String(data.content || '').trimEnd();

		if (!data.fromQueue && !isAdmin) {
			await user.isReadyToPost(uid, data.cid);
			Topics.checkContent(data.content);
			if (!await posts.canUserPostContentWithLinks(uid, data.content)) {
				throw new Error(`[[error:not-enough-reputation-to-post-links, ${meta.config['min:rep:post-links']}]]`);
			}
		}

		// For replies to scheduled topics, don't have a timestamp older than topic's itself
		if (topicData.scheduled) {
			data.timestamp = topicData.lastposttime + 1;
		}

		// Add a flag to any content with banned words
		if (flagContent(data.content)) {
			data.contentFlag = true;
		}

		data.ip = data.req ? data.req.ip : null;
		let postData: any = await posts.create(data);
		postData = await onNewPost(postData, data);

		const settings: any = await user.getSettings(uid);
		if (uid > 0 && settings.followTopicsOnReply) {
			await Topics.follow(postData.tid, uid);
		}

		if (parseInt(uid, 10)) {
			user.setUserField(uid, 'lastonline', Date.now());
		}

		if (parseInt(uid, 10) || meta.config.allowGuestReplyNotifications) {
			const { displayname } = postData.user;

			Topics.notifyFollowers(postData, uid, {
				type: 'new-reply',
				bodyShort: translator.compile('notifications:user-posted-to', displayname, postData.topic.title),
				nid: `new_post:tid:${postData.topic.tid}:pid:${postData.pid}:uid:${uid}`,
				mergeId: `notifications:user-posted-to|${postData.topic.tid}`,
			});
		}

		analytics.increment(['posts', `posts:byCid:${data.cid}`]);
		plugins.hooks.fire('action:topic.reply', { post: _.clone(postData), data: data });

		return postData;
	};

	async function onNewPost(postData: any, data: any): Promise<any> {
		const { tid, uid }: { tid: number; uid: number; } = postData;
		await Topics.markAsRead([tid], uid);
		const [
			userInfo,
			topicInfo,
		]: any[] = await Promise.all([
			posts.getUserInfoForPosts([postData.uid], uid),
			Topics.getTopicFields(tid, ['tid', 'uid', 'title', 'slug', 'cid', 'postcount', 'mainPid', 'scheduled', 'tags']),
			Topics.addParentPosts([postData]),
			Topics.syncBacklinks(postData),
			posts.parsePost(postData),
		]);

		postData.user = userInfo[0];
		postData.topic = topicInfo;
		postData.index = topicInfo.postcount - 1;

		posts.overrideGuestHandle(postData, data.handle);

		postData.votes = 0;
		postData.bookmarked = false;
		postData.display_edit_tools = true;
		postData.display_delete_tools = true;
		postData.display_moderator_tools = true;
		postData.display_move_tools = true;
		postData.selfPost = false;
		postData.timestampISO = utils.toISOString(postData.timestamp);
		postData.topic.title = String(postData.topic.title);

		return postData;
	}

	Topics.checkTitle = function (title: string): void {
		check(title, meta.config.minimumTitleLength, meta.config.maximumTitleLength, 'title-too-short', 'title-too-long');
	};

	Topics.checkContent = function (content: string): void {
		check(content, meta.config.minimumPostLength, meta.config.maximumPostLength, 'content-too-short', 'content-too-long');
	};

	function check(item: ?any, min: number, max: number, minError: string, maxError: string): void {
		// Trim and remove HTML (latter for composers that send in HTML, like redactor)
		if (typeof item === 'string') {
			item = utils.stripHTMLTags(item).trim();
		}

		if (item === null || item === undefined || item.length < parseInt(min, 10)) {
			throw new Error(`[[error:${minError}, ${min}]]`);
		} else if (item.length > parseInt(max, 10)) {
			throw new Error(`[[error:${maxError}, ${max}]]`);
		}
	}

	async function guestHandleValid(data: any): Promise<void> {
		if (meta.config.allowGuestHandles && parseInt(data.uid, 10) === 0 && data.handle) {
			if (data.handle.length > meta.config.maximumUsernameLength) {
				throw new Error('[[error:guest-handle-invalid]]');
			}
			const exists = await user.existsBySlug(slugify(data.handle));
			if (exists) {
				throw new Error('[[error:username-taken]]');
			}
		}
	}

	async function canReply(data: any, topicData: any): Promise<void> {
		if (!topicData) {
			throw new Error('[[error:no-topic]]');
		}
		const { tid, uid }: { tid: number; uid: number; } = data;
		const { cid, deleted, locked, scheduled }: {
			cid: ?number;
			deleted: boolean;
			locked: boolean;
			scheduled: boolean;
		} = topicData;

		const [canReply, canSchedule, isAdminOrMod]: boolean[] = await Promise.all([
			privileges.topics.can('topics:reply', tid, uid),
			privileges.topics.can('topics:schedule', tid, uid),
			privileges.categories.isAdminOrMod(cid, uid),
		]);

		if (locked && !isAdminOrMod) {
			throw new Error('[[error:topic-locked]]');
		}

		if (!scheduled && deleted && !isAdminOrMod) {
			throw new Error('[[error:topic-deleted]]');
		}

		if (scheduled && !canSchedule) {
			throw new Error('[[error:no-privileges]]');
		}

		if (!canReply) {
			throw new Error('[[error:no-privileges]]');
		}
	}
};
