const test = require('bron');
const assert = require('assert');
const { EOL } = require('os');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const stream = require('stream');
const fs = require('fs');
const { factory, runTasks } = require('release-it/test/util');

const conventionalRecommendedBump = sinon.stub().callsFake((options, cb) => {
  if (options.preset === 'angular') return cb(null, { releaseType: 'minor' });
  cb(new Error('Something went wrong'));
});

const conventionalChangelog = sinon.stub().callsFake(options => {
  const readableStream = new stream.Readable();
  readableStream._read = () => {};
  process.nextTick(() => {
    readableStream.emit('data', 'The changelog');
    if (options.releaseCount < 0) readableStream.emit('error', new Error('Something went wrong'));
    readableStream.emit('end');
  });
  return readableStream;
});

const Plugin = proxyquire('.', {
  'conventional-recommended-bump': conventionalRecommendedBump,
  'conventional-changelog': conventionalChangelog
});

const namespace = 'conventional-changelog';
const preset = 'angular';
const infile = 'CHANGES.md';
const git = { tagName: '${version}' };

test('should not throw', async t => {
  const options = { [namespace]: { preset }, git: false };
  const plugin = factory(Plugin, { namespace, options });
  await assert.doesNotReject(runTasks(plugin));
});

test('should set changelog', async t => {
  const options = { [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { changelog } = plugin.config.getContext();
  assert.strictEqual(changelog, 'The changelog');
});

test('should use recommended bump', async t => {
  const options = { [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.strictEqual(version, '1.1.0');
});

test('should ignore recommended bump (option)', async t => {
  const options = { [namespace]: { preset, ignoreRecommendedBump: true }, git };
  const plugin = factory(Plugin, { namespace, options });
  const spy = sinon.spy(plugin, 'generateChangelog');
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.strictEqual(spy.callCount, 2);
  assert.strictEqual(version, '1.0.1');
});

test('should use provided pre-release id', async t => {
  const options = { preRelease: 'alpha', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.strictEqual(version, '1.1.0-alpha.0');
});

test('should use provided pre-release id (pre-release continuation)', async t => {
  const options = { preRelease: 'alpha', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  const stub = sinon.stub(plugin, 'getLatestVersion').returns('1.1.0-alpha.0');
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.strictEqual(version, '1.1.0-alpha.1');
  stub.restore();
});

test('should use provided pre-release id (next pre-release)', async t => {
  const options = { preRelease: 'beta', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  const stub = sinon.stub(plugin, 'getLatestVersion').returns('1.1.0-alpha.1');
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.strictEqual(version, '1.1.0-beta.0');
  stub.restore();
});

test('should use recommended bump (after pre-rerelease)', async t => {
  const options = { [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  const stub = sinon.stub(plugin, 'getLatestVersion').returns('1.0.1-beta.0');
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.strictEqual(version, '1.1.0');
  stub.restore();
});

test('should follow true semver (pre-release continuation)', async t => {
  const options = { preRelease: 'alpha', [namespace]: { preset, strictSemVer: true }, git };
  const plugin = factory(Plugin, { namespace, options });
  const stub = sinon.stub(plugin, 'getLatestVersion').returns('1.1.0-alpha.0');
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.strictEqual(version, '1.2.0-alpha.0');
  stub.restore();
});

test('should use provided increment', async t => {
  const options = { increment: 'major', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.strictEqual(version, '2.0.0');
});

test('should use provided version', async t => {
  const options = { increment: '1.2.3', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.strictEqual(version, '1.2.3');
});

test(`should write and update infile (${infile})`, async t => {
  const options = { [namespace]: { preset, infile }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const changelog = fs.readFileSync(infile);
  assert.strictEqual(changelog.toString().trim(), 'The changelog');
  {
    await runTasks(plugin);
    const changelog = fs.readFileSync(infile);
    assert.strictEqual(changelog.toString().trim(), `The changelog${EOL}${EOL}The changelog`);
  }
  fs.unlinkSync(infile);
});

test('should pass context and gitRawCommitsOpts', async t => {
  conventionalChangelog.resetHistory();
  const context = { linkCompare: false };
  const gitRawCommitsOpts = { merges: true };
  const options = { [namespace]: { preset, context, gitRawCommitsOpts } };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const args = conventionalChangelog.args[0];
  assert.deepStrictEqual(args[0], { releaseCount: 1, preset: 'angular', tagPrefix: '' });
  assert.deepStrictEqual(args[1], { version: '1.1.0', currentTag: null, previousTag: undefined, linkCompare: false });
  assert.deepStrictEqual(args[2], { debug: null, merges: true });
});

test('should reject if conventional bump passes error', async t => {
  const options = { [namespace]: { preset: 'what?' }, git };
  const plugin = factory(Plugin, { namespace, options });
  await assert.rejects(runTasks(plugin), /Something went wrong/);
});

test('should reject if conventional changelog has error', async t => {
  const options = { [namespace]: { preset, releaseCount: -1 }, git };
  const plugin = factory(Plugin, { namespace, options });
  await assert.rejects(runTasks(plugin), /Something went wrong/);
});

test('should not write infile in dry run', async t => {
  const infile = 'DRYRUN.md';
  const options = { 'dry-run': true, [namespace]: { preset, infile }, git };
  const plugin = factory(Plugin, { namespace, options });
  const spy = sinon.spy(plugin, 'writeChangelog');
  await runTasks(plugin);
  assert.strictEqual(spy.callCount, 0);
  assert.throws(() => fs.readFileSync(infile), /no such file/);
});

test('should pass only parserOpts', async t => {
  conventionalChangelog.resetHistory();
  const parserOpts = {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    mergeCorrespondence: ['id', 'source']
  };
  const options = { [namespace]: { preset, parserOpts } };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const args = conventionalChangelog.args[0];
  assert.deepStrictEqual(args[0], { releaseCount: 1, preset: 'angular', tagPrefix: '' });
  assert.deepStrictEqual(args[1], { version: '1.1.0', currentTag: null, previousTag: undefined });
  assert.deepStrictEqual(args[2], { debug: null });
  assert.deepStrictEqual(args[3], {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    mergeCorrespondence: ['id', 'source']
  });
  assert.deepStrictEqual(args[4], undefined);
});

test('should pass only writerOpts', async t => {
  conventionalChangelog.resetHistory();
  const writerOpts = {
    groupBy: 'scope'
  };
  const options = { [namespace]: { preset, writerOpts } };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const args = conventionalChangelog.args[0];
  assert.deepStrictEqual(args[0], { releaseCount: 1, preset: 'angular', tagPrefix: '' });
  assert.deepStrictEqual(args[1], { version: '1.1.0', currentTag: null, previousTag: undefined });
  assert.deepStrictEqual(args[2], { debug: null });
  assert.deepStrictEqual(args[3], undefined);
  assert.deepStrictEqual(args[4], {
    groupBy: 'scope'
  });
});

test('should pass parserOpts and writerOpts', async t => {
  conventionalChangelog.resetHistory();
  const parserOpts = {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    mergeCorrespondence: ['id', 'source']
  };
  const writerOpts = {
    groupBy: 'type'
  };
  const options = { [namespace]: { preset, parserOpts, writerOpts } };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const args = conventionalChangelog.args[0];
  assert.deepStrictEqual(args[0], { releaseCount: 1, preset: 'angular', tagPrefix: '' });
  assert.deepStrictEqual(args[1], { version: '1.1.0', currentTag: null, previousTag: undefined });
  assert.deepStrictEqual(args[2], { debug: null });
  assert.deepStrictEqual(args[3], {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    mergeCorrespondence: ['id', 'source']
  });
  assert.deepStrictEqual(args[4], {
    groupBy: 'type'
  });
});
