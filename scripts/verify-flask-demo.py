"""Independent checks for a model-edited disposable Flask checkout.
Run with PYTHONPATH pointing at that checkout's src directory.
"""
import json
import os
import sys


def check_inline():
    from flask.helpers import get_debug_flag
    previous = os.environ.pop("FLASK_DEBUG", None)
    try:
        assert get_debug_flag() is False
        for value in ("", "0", "false", "FALSE", "no", "NO", "off", "OFF", "n", "N"):
            os.environ["FLASK_DEBUG"] = value
            assert get_debug_flag() is False, value
        for value in ("1", "yes", "on", "true", "other"):
            os.environ["FLASK_DEBUG"] = value
            assert get_debug_flag() is True, value
        doc = get_debug_flag.__doc__ or ""
        for value in ("0", "false", "no", "off", "n"):
            assert value in doc.lower(), value
    finally:
        if previous is None:
            os.environ.pop("FLASK_DEBUG", None)
        else:
            os.environ["FLASK_DEBUG"] = previous
    print("PASS: inline false/true cases and documented false values")


def check_config():
    from flask import Flask
    app = Flask("forge_demo")
    app.config.update(SECRET_KEY="private", DB_PASSWORD="private", API_TOKEN="private", PRIVATE_KEY="private", PUBLIC_NAME="visible")
    runner = app.test_cli_runner()
    help_result = runner.invoke(args=["--help"])
    assert help_result.exit_code == 0, help_result.output
    assert "config" in help_result.output
    result = runner.invoke(args=["config"])
    assert result.exit_code == 0, (result.output, repr(result.exception))
    output = json.loads(result.output)
    for key in ("SECRET_KEY", "DB_PASSWORD", "API_TOKEN", "PRIVATE_KEY"):
        assert output[key] == "***", (key, output[key])
    assert output["PUBLIC_NAME"] == "visible"
    assert app.config["SECRET_KEY"] == "private", "printing must not mutate the application"
    print("PASS: help listing, valid JSON, secret masking, ordinary values, unchanged application config")


if __name__ == "__main__":
    {"A": check_inline, "B": check_config}[sys.argv[1]]()
