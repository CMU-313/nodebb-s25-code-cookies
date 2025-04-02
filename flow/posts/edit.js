// @flow

'use strict';

const validator = require('validator');
const _ = require('lodash');

const db = require('../database');
const meta = require('../meta');
const topics = require('../topics');
const user = require('../user');
const privileges = require('../privileges');
const plugins = require('../plugins');
const pubsub = require('../pubsub');
const utils = require('../utils');
const slugify = require('../slugify');
const translator = require('../translator');
const flagContent = require('./flagContent');

module.exports = function (Posts: any): any {
	pubsub.on('post:edit', (pid: string): void => {
		require('./cache').del(pid);
	});

	Posts.edit = async function (data: any): Promise<{
		topic: any;
		editor: any;
		post: any;
	}> {
		const canEdit: any = await privileges.posts.canEdit(data.pid, data.uid);
		const postData: any = await Posts.getPostData(data.pid);
		const topicData: {
			cid: string;
			mainPid: string;
			title: string;
			timestamp: number;
			scheduled: boolean;
			slug: string;
			tags: any;
			uid: string;
		} = await topics.getTopicFields(postData.tid, [
			'cid', 'mainPid', 'title', 'timestamp', 'scheduled', 'slug', 'tags', 'uid',
		]);

		if (!canEdit.flag && !canEndorse(data, postData, topicData)) {
			throw new Error(canEdit.message);
		}
		if (!postData) {
			throw new Error('[[error:no-post]]');
		}


		await scheduledTopicCheck(data, topicData);

		const oldContent: string = postData.content; // for diffing purposes
		const editPostData: any = getEditPostData(data, topicData, postData);

		if (data.handle) {
			editPostData.handle = data.handle;
		}

		const result: any = await plugins.hooks.fire('filter:post.edit', {
			req: data.req,
			post: editPostData,
			data: data,
			uid: data.uid,
		});

		const [editor, topic] = await Promise.all([
			user.getUserFields(data.uid, ['username', 'userslug']),
			editMainPost(data, postData, topicData),
		]);

		await Posts.setPostFields(data.pid, result.post);
		const contentChanged: boolean = data.content !== oldContent ||
			topic.renamed ||
			topic.tagsupdated;

		if (meta.config.enablePostHistory === 1 && contentChanged) {
			await Posts.diffs.save({
				pid: data.pid,
				uid: data.uid,
				oldContent: oldContent,
				newContent: data.content,
				edited: editPostData.edited,
				topic,
			});
		}
		await Posts.uploads.sync(data.pid);

		// Normalize data prior to constructing returnPostData (match types with getPostSummaryByPids)
		postData.deleted = !!postData.deleted;

		const returnPostData: any = { ...postData, ...result.post };
		returnPostData.cid = topic.cid;
		returnPostData.topic = topic;
		returnPostData.editedISO = utils.toISOString(editPostData.edited);
		returnPostData.changed = contentChanged;
		returnPostData.oldContent = oldContent;
		returnPostData.newContent = data.content;

		await topics.notifyFollowers(returnPostData, data.uid, {
			type: 'post-edit',
			bodyShort: translator.compile('notifications:user-edited-post', editor.username, topic.title),
			nid: `edit_post:${data.pid}:uid:${data.uid}`,
		});
		await topics.syncBacklinks(returnPostData);

		plugins.hooks.fire('action:post.edit', { post: _.clone(returnPostData), data: data, uid: data.uid });

		require('./cache').del(String(postData.pid));
		pubsub.publish('post:edit', String(postData.pid));

		await Posts.parsePost(returnPostData);

		return {
			topic: topic,
			editor: editor,
			post: returnPostData,
		};
	};

	async function editMainPost(data: any, postData: any, topicData: any): Promise<{
		tid: string;
		uid: ?string;
		cid: string;
		title: string;
		oldTitle: ?string;
		slug: ?string;
		isMainPost: boolean;
		renamed: boolean;
		tagsupdated: boolean;
		tags: ?any;
		oldTags: ?any;
		rescheduled: ?boolean,
	}> {
		const { tid }: {tid: string;} = postData;
		const title: string = data.title ? data.title.trim() : '';

		const isMain: boolean = parseInt(data.pid, 10) === parseInt(topicData.mainPid, 10);
		if (!isMain) {
			return {
				tid: tid,
				uid: undefined,
				cid: topicData.cid,
				title: topicData.title,
				oldTitle: undefined,
				isMainPost: false,
				slug: undefined,
				renamed: false,
				tags: undefined,
				oldTags: undefined,
				tagsupdated: false,
				rescheduled: undefined,
			};
		}

		const newTopicData: {
			tid: string;
			cid: string;
			uid: string;
			mainPid: boolean;
			timestamp: number;
			title: ?string;
			oldTitle: ?string;
			slug: ?string;
			tags: ?any;
		} = {
			tid: tid,
			cid: topicData.cid,
			uid: postData.uid,
			mainPid: data.pid,
			timestamp: rescheduling(data, topicData) ? data.timestamp : topicData.timestamp,
			title: undefined,
			oldTitle: undefined,
			slug: undefined,
			tags: undefined,
		};
		if (title) {
			newTopicData.title = title;
			newTopicData.slug = `${tid}/${slugify(title) || 'topic'}`;
		}

		const tagsupdated: boolean = Array.isArray(data.tags) &&
			!_.isEqual(data.tags, topicData.tags.map(tag => tag.value));

		if (tagsupdated) {
			const canTag: boolean = await privileges.categories.can('topics:tag', topicData.cid, data.uid);
			if (!canTag) {
				throw new Error('[[error:no-privileges]]');
			}
			await topics.validateTags(data.tags, topicData.cid, data.uid, tid);
		}

		const results: any = await plugins.hooks.fire('filter:topic.edit', {
			req: data.req,
			topic: newTopicData,
			data: data,
		});
		await db.setObject(`topic:${tid}`, results.topic);
		if (tagsupdated) {
			await topics.updateTopicTags(tid, data.tags);
		}
		const tags: any = await topics.getTopicTagsObjects(tid);

		if (rescheduling(data, topicData)) {
			await topics.scheduled.reschedule(newTopicData);
		}

		newTopicData.tags = data.tags;
		newTopicData.oldTitle = topicData.title;
		const renamed: boolean = Boolean(title) && (translator.escape(validator.escape(String(title))) !== topicData.title);
		plugins.hooks.fire('action:topic.edit', { topic: newTopicData, uid: data.uid });
		return {
			tid: tid,
			cid: newTopicData.cid,
			uid: postData.uid,
			title: validator.escape(String(title)),
			oldTitle: topicData.title,
			slug: newTopicData.slug || topicData.slug,
			isMainPost: true,
			renamed: renamed,
			tagsupdated: tagsupdated,
			tags: tags,
			oldTags: topicData.tags,
			rescheduled: rescheduling(data, topicData),
		};
	}

	async function scheduledTopicCheck(data: any, topicData: any): Promise<any> {
		if (!topicData.scheduled) {
			return;
		}
		const canSchedule: boolean = await privileges.categories.can('topics:schedule', topicData.cid, data.uid);
		if (!canSchedule) {
			throw new Error('[[error:no-privileges]]');
		}
		const isMain: boolean = parseInt(data.pid, 10) === parseInt(topicData.mainPid, 10);
		if (isMain && isNaN(data.timestamp)) {
			throw new Error('[[error:invalid-data]]');
		}
	}

	function getEditPostData(data: any, topicData: any, postData: any): {
		content: string;
		editor: string;
		contentFlag: boolean;
		endorsed: string;
		edited: ?number;
		timestamp: ?number;
	} {
		// Toggle endorsed attribute if data.endorsed is true
		let { endorsed }: { endorsed: string; } = postData;
		if (data.endorsed === 'true') {
			endorsed = postData.endorsed === 'true' ? 'false' : 'true';
		}

		const editPostData: {
			content: string;
			editor: string;
			contentFlag: boolean;
			endorsed: string;
			edited: ?number;
			timestamp: ?number;
		} = {
			content: data.content,
			editor: data.uid,
			contentFlag: flagContent(data.content),
			endorsed: endorsed,
			edited: undefined,
			timestamp: undefined,
		};

		// For posts in scheduled topics, if edited before, use edit timestamp
		editPostData.edited = topicData.scheduled ? (postData.edited || postData.timestamp) + 1 : Date.now();

		// if rescheduling the main post
		if (rescheduling(data, topicData)) {
			// For main posts, use timestamp coming from user (otherwise, it is ignored)
			editPostData.edited = data.timestamp;
			editPostData.timestamp = data.timestamp;
		}

		return editPostData;
	}

	function rescheduling(data: any, topicData: any): boolean {
		const isMain: boolean = parseInt(data.pid, 10) === parseInt(topicData.mainPid, 10);
		return isMain && topicData.scheduled && topicData.timestamp !== data.timestamp;
	}

	// Determines if an edit request can override normal edit permissions to endorse a post
	function canEndorse(data: any, post: any, topic: any): boolean {
		// Only can endorse if topic owner
		if (data.uid !== topic.uid) {
			return false;
		}

		// data must be endorsing
		if (data.endorsed === undefined) {
			return false;
		}

		// Can't edit content in endorsement
		if (data.content !== post.content) {
			return false;
		}

		return true;
	}
};
