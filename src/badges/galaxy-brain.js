/**
 * Galaxy Brain - have your reply marked as the accepted answer in a Q&A discussion.
 * Base 2, Bronze 8, Silver 16, Gold 32.
 *
 * This is the one badge that genuinely needs a second account with a token, because a
 * single account cannot both ask a question and be credited for answering it. Each
 * accepted answer is a three-step dance:
 *
 *   1. the ALT opens a discussion in an answerable (Q&A) category
 *   2. YOU reply to it
 *   3. the ALT, as the discussion author, marks your reply as the answer
 *
 * Only step 2 is credited, which is why steps 1 and 3 run under the alt's token.
 */

import { gh } from '../gh.js';
import { recordCycle } from '../state.js';
import { Throttle, withRetry } from '../throttle.js';
import { RATE } from '../config.js';

export const key = 'galaxy-brain';
export const label = 'Galaxy Brain';

/** Run a GraphQL query, optionally as the alt account. */
async function graphql(ctx, query, variables = {}, token = null) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [name, value] of Object.entries(variables)) {
    args.push('-f', `${name}=${value}`);
  }
  const env = token ? { GH_TOKEN: token, GITHUB_TOKEN: token } : {};
  const stdout = await withRetry(() => gh(args, { cwd: ctx.root, env }));
  const parsed = JSON.parse(stdout);
  if (parsed.errors?.length) {
    throw new Error(`GraphQL: ${parsed.errors.map((e) => e.message).join('; ')}`);
  }
  return parsed.data;
}

const REPO_QUERY = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    id
    hasDiscussionsEnabled
    discussionCategories(first:25){nodes{id name slug isAnswerable}}
  }
}`;

const CREATE_DISCUSSION = `mutation($repoId:ID!,$catId:ID!,$title:String!,$body:String!){
  createDiscussion(input:{repositoryId:$repoId,categoryId:$catId,title:$title,body:$body}){
    discussion{id number url}
  }
}`;

const ADD_COMMENT = `mutation($discId:ID!,$body:String!){
  addDiscussionComment(input:{discussionId:$discId,body:$body}){comment{id url}}
}`;

const MARK_ANSWER = `mutation($commentId:ID!){
  markDiscussionCommentAsAnswer(input:{id:$commentId}){discussion{id}}
}`;

/** Turn on Discussions if the repo doesn't have them yet. */
export async function enableDiscussions(ctx) {
  await withRetry(() =>
    gh(
      ['api', '-X', 'PATCH', `repos/${ctx.repo.nameWithOwner}`, '-F', 'has_discussions=true'],
      { cwd: ctx.root },
    ),
  );
}

/**
 * Resolve the repository id and an answerable category, enabling Discussions first if
 * needed. Only answerable categories can have an accepted answer, so a repo whose Q&A
 * category was deleted cannot earn this badge until one is recreated.
 */
export async function resolveTarget(ctx) {
  const [owner, name] = ctx.repo.nameWithOwner.split('/');
  let data = await graphql(ctx, REPO_QUERY, { owner, name });

  if (!data.repository.hasDiscussionsEnabled) {
    await enableDiscussions(ctx);
    data = await graphql(ctx, REPO_QUERY, { owner, name });
  }

  const categories = data.repository.discussionCategories.nodes;
  const answerable = categories.find((c) => c.isAnswerable);
  if (!answerable) {
    throw new Error(
      'No answerable (Q&A) discussion category exists on this repo. Create one at ' +
        `https://github.com/${ctx.repo.nameWithOwner}/discussions/categories - ` +
        'Galaxy Brain only counts answers in answerable categories.',
    );
  }

  return { repoId: data.repository.id, category: answerable };
}

/** One question -> answer -> accept round trip. Returns the discussion and comment. */
export async function runOnce(ctx, { repoId, categoryId, index, altToken, dryRun }) {
  const title = `Q: get-all-achievements round ${index}`;
  const questionBody =
    'Automated Q&A round opened by get-all-achievements to exercise the ' +
    'Galaxy Brain achievement flow.';
  const answerBody = `Answer for round ${index}.`;

  if (dryRun) {
    return {
      dryRun: true,
      steps: [
        'createDiscussion (as alt)',
        'addDiscussionComment (as you)',
        'markDiscussionCommentAsAnswer (as alt)',
      ],
    };
  }

  const created = await graphql(
    ctx,
    CREATE_DISCUSSION,
    { repoId, catId: categoryId, title, body: questionBody },
    altToken,
  );
  const discussion = created.createDiscussion.discussion;

  // Deliberately NOT using the alt token: this reply is the thing being credited.
  const commented = await graphql(ctx, ADD_COMMENT, {
    discId: discussion.id,
    body: answerBody,
  });
  const comment = commented.addDiscussionComment.comment;

  await graphql(ctx, MARK_ANSWER, { commentId: comment.id }, altToken);

  return { discussion, comment };
}

export async function run(ctx, options = {}) {
  const {
    state,
    count,
    altToken,
    intervalMs = RATE.galaxyRoundMs,
    dryRun = false,
    onProgress,
  } = options;

  if (!altToken && !dryRun) {
    throw new Error(
      'Galaxy Brain needs a second account. Provide that token via ' +
        'GAA_ALT_TOKEN or a .gaa-alt-token file. A classic token needs public_repo; ' +
        'a fine-grained token needs Discussions: Read and write on this repo.',
    );
  }

  const target = dryRun ? { repoId: null, category: { id: null } } : await resolveTarget(ctx);
  const throttle = new Throttle(intervalMs);
  const results = [];
  const startCount = state ? state.badges[key]?.completed ?? 0 : 0;

  for (let i = 0; i < count; i += 1) {
    const index = startCount + i + 1;
    if (!dryRun) await throttle.wait();

    const result = await runOnce(ctx, {
      repoId: target.repoId,
      categoryId: target.category.id,
      index,
      altToken,
      dryRun,
    });

    if (!dryRun) {
      recordCycle(
        state,
        key,
        { discussion: result.discussion.number, comment: result.comment.id },
        ctx.root,
      );
    }

    results.push(result);
    onProgress?.({
      done: i + 1,
      total: count,
      index,
      result,
      remainingMs: (count - i - 1) * intervalMs,
    });
  }

  return results;
}
