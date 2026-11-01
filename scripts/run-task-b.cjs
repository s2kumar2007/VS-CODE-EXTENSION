const { spawn } = require('node:child_process');
const path = require('node:path');

const guidance = `Plan:
1. In src/flask/cli.py:
Anchor 1:
old_text:
class AppGroup(click.Group):
    """This works similar to a regular click :class:\`~click.Group\` but it
    changes the behavior of the :meth:\`command\` decorator so that it
    automatically wraps the functions in :func:\`with_appcontext\`.

    Not to be confused with :class:\`FlaskGroup\`.
    """
new_text:
class AppGroup(click.Group):
    """This works similar to a regular click :class:\`~click.Group\` but it
    changes the behavior of the :meth:\`command\` decorator so that it
    automatically wraps the functions in :func:\`with_appcontext\`.

    Not to be confused with :class:\`FlaskGroup\`.
    """

    def get_command(self, ctx: click.Context, name: str) -> click.Command | None:
        rv = super().get_command(ctx, name)
        if rv is not None:
            return rv
        if name == "config":
            return config_command
        return None

    def list_commands(self, ctx: click.Context) -> list[str]:
        return sorted(set(super().list_commands(ctx)) | {"config"})

Anchor 2:
old_text:
        if add_default_commands:
            self.add_command(run_command)
            self.add_command(shell_command)
            self.add_command(routes_command)
new_text:
        if add_default_commands:
            self.add_command(run_command)
            self.add_command(shell_command)
            self.add_command(routes_command)
            self.add_command(config_command)

Anchor 3:
old_text:
    for row in rows:
        click.echo(template.format(*row))
new_text:
    for row in rows:
        click.echo(template.format(*row))


@click.command("config", short_help="Show the configuration.")
@with_appcontext
def config_command() -> None:
    """Show the loaded application's configuration as JSON."""
    import json
    data = {k: ("***" if any(s in k.upper() for s in ("SECRET", "PASSWORD", "TOKEN", "KEY")) else v) for k, v in current_app.config.items()}
    click.echo(json.dumps(data, indent=2, default=str))

2. In tests/test_cli.py:
old_text:
def runner():
    return CliRunner()
new_text:
def runner():
    return CliRunner()


def test_config(runner, app):
    import json
    app.config["SECRET_KEY"] = "supersecret"
    app.config["DB_PASSWORD"] = "secretpass"
    app.config["API_TOKEN"] = "mytoken"
    app.config["PRIVATE_KEY"] = "mykey"
    app.config["PUBLIC_SETTING"] = "public"
    runner = app.test_cli_runner()
    res = runner.invoke(args=["config"])
    assert res.exit_code == 0
    data = json.loads(res.output)
    assert data["SECRET_KEY"] == "***"
    assert data["DB_PASSWORD"] == "***"
    assert data["API_TOKEN"] == "***"
    assert data["PRIVATE_KEY"] == "***"
    assert data["PUBLIC_SETTING"] == "public"
    assert app.config["SECRET_KEY"] == "supersecret"
    res_help = runner.invoke(args=["--help"])
    assert "config" in res_help.output

3. In docs/cli.rst:
old_text:
Use :meth:\`~Flask.shell_context_processor\` to add other automatic imports.
new_text:
Use :meth:\`~Flask.shell_context_processor\` to add other automatic imports.


Show Configuration
------------------

To inspect the loaded application's configuration, use the :func:\`config <cli.config_command>\` command.
The configuration will be emitted as JSON. Sensitive values whose keys contain \`\`SECRET\`\`, \`\`PASSWORD\`\`,
\`\`TOKEN\`\`, or \`\`KEY\`\` are masked as \`\`"***"\`\`::

    $ flask config

Execute propose_write for each file directly with edits: [{old_text, new_text}]. Do not perform redundant reads or searches.`;

const env = {
  ...process.env,
  FORGE_LIVE_PRIMARY: 'forge-agent',
  FORGE_LIVE_COMPACTION_TOKENS: '30000',
  FORGE_LIVE_REASONING_EFFORT: 'low',
  FORGE_LIVE_CONTEXT_BUDGET: '50',
  FORGE_LIVE_TIMEOUT_MS: '2400000',
  FORGE_PYTHON: 'python',
  FORGE_LIVE_GUIDANCE: guidance,
};

const args = [
  'scripts/run-live-tests.cjs',
  'B',
  'C:\\Users\\K\\AppData\\Local\\Temp\\forge-live-B',
  'groq/qwen-3-8-27b',
  'C:\\Users\\K\\AppData\\Local\\Temp\\forge-vscode-insiders\\Code - Insiders.exe',
  'docs/live-B-verified.json',
];

const child = spawn(process.execPath, args, { stdio: 'inherit', env });
child.on('exit', (code) => {
  process.exit(code ?? 0);
});
