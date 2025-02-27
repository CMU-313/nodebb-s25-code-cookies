# Content Flag Feature
## What is it?
This feature places a flag icon next to all posts that contain common curse words. If a curse word is added or removed via an edit the flag icon is added or removed accordingly accordingly.
## How to Use and Test
When opening Nodebb, log in and open any topic. Reply to the topic by either using the reply button in the top right or the quick reply feature at the bottom. Make sure your reply contains a common curseword (such as the f-word). After you post your reply, reload and you should see a flag icon next to your post. Edit your post and remove the curse word and then reload once more. You should no longer see the flag icon.
## Automated Tests
In the file test/topic.js a test case was added to verify that a new post that did not contain curse words would not get the contentFlag attribute set to true, thereby flagging the post. Similarly, in the same file, another test replies with a curse words and verifies that the reply has the contentFlag attribute set to true as this reply should be flagged.

In the file test/posts.js another test case was added to test that a post that was edited to contain a curse word would update the contentFlag attribute to be true as this post whould now be flagged. Also, annother test was added to check if a post that was edited to not contain a curse word would have the contentFlag attribute set to false as this post should not be flagged.

Since these test cases cover both the initial adding of the content flag and the updating of it on post edits, it is fairly clear that these test cases adiquitly cover the major requirements of the feature. Since we now know with confidence that the backend correctly adds content flags to new replies with curse words and updates the flag on edit which is exactly the specifications for this feature.

# Post Endorsement Feature
## What is it?
This feature lets topic owners select replies to their topic for endorsement. Endorsed replies get a gold start next to them that is visible to all users. Only the topic owner is allowed to endorse replies. Endorsing a reply again removes the endorsement. The posts under a topic will be reordered such that the topic's original post is first, followed by endorsed posts, and lastly with not endorsed posts, all in chronological order within their respective groups. 
## How to Use and Test
To use this feature log in and create a new topic. Since you are not the topic owner create a new reply by either using the reply button on the top right or the quick reply button at the bottom of the screen. If you hover your mouse over your new reply, you should see 3 verticle dots in the bottom right corner of the reply. Click it and you should see an endorse button marked with a gold star. After clicking the endorse button reload and you should find that your reply has been marked with a gold star icon. You should also see the reply move up in the order, under the topic's original post but before the rest of the not endorsed replies. If you endorse your reply agin and reload, you will see that the star is removed. The order will be reverted and it will be in chronological order within the not endorsed replies. If you attempt this process on a topic not owned by you, you will notice that the endorse button does not appear and you will not be able to endorse your (or anyone else's) reply. However, the ordering of posts will still follow the same format, regardless of the viewing user.
## Automated Tests
In the file test/posts.js four test cases were added. The first test is a simple check that an attempt to endorse a post as someone who is not the topic owner will through an error. The second test is a check that even if the endorsement request is from the topic owner, they can't change the content of the reply. This test is necessary because the endorse request is a special call to the post.edit function so it is important that endorsements can't edit the post. The third test is to check that a valid endorsement request (one from the topic owner that doesn't change the content) correctly sets the endorsed attribute of the post to true and thus endorses the post. The last test is to check that a valid endorsement request to a post that is already endorsed removes the endorsement by setting the endorsed attribute to false.

These tests cover the major backend demands of the feature as it ensures that only valid endorsement requests go through and that the endorsement status is togglebale. Since only the topic owner can endorse we meet one of the exceptance criteria for the feature. Similarly, since no one can edit content via endorsement we ensure that we maintain the integrity of replies. Lastly, by testing that the status is toggleable we ensure compliance with the acceptance criteria of the feature for double endorsements. The post ordering was a purely front-end feature and thus required no test cases. Therefore, these test cases are sufficient to ensure the feature works as intended for general purposes.

# Topic Owner Post Delete Feature
## What is it?
This feature lets topic owners delete posts and replies under their post. The posts are then marked as deleted.
## How to Use and Test
To use this feature log in and create a new topic. Then log in to a different account and make a post or reply under the new topic. Then log back into the account that created the new topic and click on the '...' icon on the new post. There should be a button with a trash-can icon labeled 'delete'. Click on it. There will be a message asking if you really want to delete the post. Select yes. The post should now be marked as deleted.
## Automated Tests
In the file test/posts.js there is a test case that checks a topic owner is able to delete a post under their topic. No additonal tests are needed because there exist tests to verify that users have the proper delete permissions. As such, there is no need to test that topic owners don't have more delete privileges than intended since it is covered for by existing tests (topic owners are regular users in other topics).

# Anonymous Post Feature
## What is it?
This feature allows users to post replies anonymously under a topic by selecting an “anonymous” checkbox in the quick reply section. When this option is enabled, the user’s avatar, username, and all links to their profile will be hidden. Instead, the post will display a default avatar and the name “Anonymous.” This feature is particularly useful for students who may feel uncomfortable or embarrassed asking questions and promotes a less stressful learning environment.
## How to Use and Test
1. Open NodeBB and log in.
2. Navigate to any topic and click the quick reply box at the bottom of the page.
3. Type your reply and check the “anonymous” checkbox before submitting.
4. Submit your reply and observe that the username is replaced with “Anonymous,” the avatar is a default gray circle, and all links to the user’s profile are removed.
5. To verify that the post is indeed anonymous, attempt to click on the avatar or username; they should not lead to any profile.
6. Post another reply without selecting the anonymous checkbox and ensure that the username and avatar display normally.
## Automated Tests
In test/topics.js, two key test cases were added to validate this feature. The first test verifies that when a user submits a post with the anonymous checkbox checked, the anonymous attribute is correctly set to true in the backend. The second test checks that when the anonymous checkbox is not selected, the anonymous attribute is set to false, ensuring the post retains the correct user information.
The tests validate that the backend correctly assigns the anonymous attribute based on user input from the frontend. They ensure that anonymous posts do not retain user-identifying information and that non-anonymous posts display the correct user details. Since the feature introduces a single backend change, these tests are sufficient to confirm that the system reliably stores and retrieves the anonymous status while maintaining user privacy. Our tests cover every possible case of this feature and therefore provide extensive coverage of the functionality we added to the code for the anonymous feature