// @flow

'use strict';

const _ = require('lodash');

const meta = require('../meta');
const db = require('../database');
const plugins = require('../plugins');
const user = require('../user');
const topics = require('../topics');
const categories = require('../categories');
const groups = require('../groups');
const privileges = require('../privileges');

module.exports = function (Posts: any): any {
	Posts.create = async function (data: any): any {
		// This is an internal method, consider using Topics.reply instead
		const { uid }: { uid: string; } = data;
		const { tid }: { tid: string } = data;
		const content: string = data.content.toString();
		const timestamp: number = data.timestamp || Date.now();
		const isMain: boolean = data.isMain || false;

		if (!uid && parseInt(uid, 10) !== 0) {
			throw new Error('[[error:invalid-uid]]');
		}

		if (data.toPid) {
			await checkToPid(data.toPid, uid);
		}

		const pid: string = await db.incrObjectField('global', 'nextPid');
		let postData: {
			pid: string;
			uid: string;
			tid: string;
			content: string;
			timestamp: number;
			toPid: ?any;
			ip: ?any;
			handle: ?any;
			contentFlag: ?string;
			contentAnonymous: ?string;
		} = {
			pid: pid,
			uid: uid,
			tid: tid,
			content: content,
			timestamp: timestamp,
			toPid: undefined,
			ip: undefined,
			handle: undefined,
			contentFlag: undefined,
			contentAnonymous: undefined,
		};

		if (data.toPid) {
			postData.toPid = data.toPid;
		}
		if (data.ip && meta.config.trackIpPerPost) {
			postData.ip = data.ip;
		}
		if (data.handle && !parseInt(uid, 10)) {
			postData.handle = data.handle;
		}
		if (data.contentFlag) {
			postData.contentFlag = data.contentFlag;
		}

		// set contentAnonymous based on if the anonymous checkbox was checked
		postData.contentAnonymous = data.anonymous;

		let result: {post: any; data: string;} = await plugins.hooks.fire('filter:post.create', { post: postData, data: data });
		postData = result.post;
		await db.setObject(`post:${postData.pid}`, postData);

		const topicData: {cid: string; pinned: any;} = await topics.getTopicFields(tid, ['cid', 'pinned']);
		postData.cid = topicData.cid;

		await Promise.all([
			db.sortedSetAdd('posts:pid', timestamp, postData.pid),
			db.incrObjectField('global', 'postCount'),
			user.onNewPostMade(postData),
			topics.onNewPostMade(postData),
			categories.onNewPostMade(topicData.cid, topicData.pinned, postData),
			groups.onNewPostMade(postData),
			addReplyTo(postData, timestamp),
			Posts.uploads.sync(postData.pid),
		]);

		result = await plugins.hooks.fire('filter:post.get', { post: postData, uid: data.uid });
		result.post.isMain = isMain;
		plugins.hooks.fire('action:post.save', { post: _.clone(result.post) });
		return result.post;
	};

	async function addReplyTo(postData: any, timestamp: number): Promise<any> {
		if (!postData.toPid) {
			return;
		}
		await Promise.all([
			db.sortedSetAdd(`pid:${postData.toPid}:replies`, timestamp, postData.pid),
			db.incrObjectField(`post:${postData.toPid}`, 'replies'),
		]);
	}

	async function checkToPid(toPid: any, uid: string): Promise<any> {
		const [toPost, canViewToPid] = await Promise.all([
			Posts.getPostFields(toPid, ['pid', 'deleted']),
			privileges.posts.can('posts:view_deleted', toPid, uid),
		]);
		const toPidExists: boolean = !!toPost.pid;
		if (!toPidExists || (toPost.deleted && !canViewToPid)) {
			throw new Error('[[error:invalid-pid]]');
		}
	}
};
