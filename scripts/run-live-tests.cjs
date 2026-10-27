/** Opt-in: real provider calls and scoped programmatic hunk approvals, NOT a manual UI demo. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawn } = require('node:child_process');
const [task, workspace, model, codeExe, result] = process.argv.slice(2);
if (!['A','B','C'].includes(task) || !workspace || !model || !codeExe || !result) {
  console.error('Usage: node scripts/run-live-tests.cjs A|B|C <clean-disposable-Flask> <configured-model-reference> <Code.exe> <result.json>');
  process.exit(1);
}
(async () => {
  const root = path.resolve(workspace);
  const head = execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  if (head !== '22d924701a6ae2e4cd01e9a15bbaf3946094af65') throw new Error('Expected pinned Flask 3.1.3 checkout');
  if (execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8',windowsHide:true}).trim()) throw new Error('Use a clean disposable checkout');
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(),'forge-live-'));
  const extension = path.join(scratch,'extension');
  await fs.mkdir(extension,{recursive:true});
  const pkg = JSON.parse(await fs.readFile('package.json','utf8'));
  pkg.main = './validation.cjs'; pkg.activationEvents = []; pkg.contributes = {};
  await fs.writeFile(path.join(extension,'package.json'),JSON.stringify(pkg));
  await fs.writeFile(path.join(extension,'validation.cjs'),'exports.activate = () => {};');
  await fs.cp('agents',path.join(extension,'agents'),{recursive:true});
  const rgName = '@vscode/ripgrep-'+process.platform+'-'+process.arch;
  const exe = process.platform === 'win32' ? 'rg.exe' : 'rg';
  const binary = require.resolve(rgName+'/bin/'+exe);
  const destination = path.join(extension,'node_modules',rgName,'bin');
  await fs.mkdir(destination,{recursive:true});
  await fs.copyFile(binary,path.join(destination,exe));
  if (process.platform !== 'win32') await fs.chmod(path.join(destination,exe),0o755);
  const tests = path.join(scratch,'tests','index.cjs');
  require('esbuild').buildSync({entryPoints:['test/native/live.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],outfile:tests});
  await fs.mkdir(path.dirname(path.resolve(result)),{recursive:true});
  const childEnv = {...process.env,USERPROFILE:process.env.USERPROFILE || os.homedir(),FORGE_LIVE_TASK:task,FORGE_LIVE_MODEL:model,FORGE_LIVE_RESULT:path.resolve(result)};
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(codeExe,['--new-window','--disable-workspace-trust','--user-data-dir='+path.join(scratch,'profile'),'--extensions-dir='+path.join(scratch,'extensions'),'--extensionDevelopmentPath='+extension,'--extensionTestsPath='+tests,root],{windowsHide:true,env:childEnv,stdio:'inherit'});
  child.on('error',error=>{console.error(error);process.exitCode=1;});
  child.on('exit',async code=>{
    try {
      const evidence = JSON.parse(await fs.readFile(path.resolve(result),'utf8'));
      if (code || evidence.finished?.status !== 'done') throw new Error('Live task did not complete: '+JSON.stringify(evidence.finished || evidence.error));
      const changed = new Set(evidence.reviews.filter(r=>r.allowed).map(r=>r.path));
      if (task === 'A' && !changed.has('src/flask/helpers.py')) throw new Error('Inline proposal was not reviewed');
      if (task === 'B' && changed.size < 3) throw new Error('Fewer than three reviewed files');
      console.log('Live '+task+' completed. Independently verify behavior with scripts/verify-flask-demo.py.');
    } catch(error) {console.error(error);process.exitCode=1;}
  });
})().catch(error=>{console.error(error);process.exitCode=1;});
