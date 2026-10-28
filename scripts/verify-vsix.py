"""Verify a bundled Forge VSIX, including its only external runtime dependency."""
import hashlib
import json
import re
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None, "Corrupt package"
    names = archive.namelist()
    assert "extension/dist/extension.js" in names
    assert "extension/node_modules/@vscode/ripgrep-win32-x64/bin/rg.exe" in names
    dependencies = [n for n in names if n.startswith("extension/node_modules/") and not n.endswith("/")]
    assert all(n.startswith("extension/node_modules/@vscode/ripgrep-win32-x64/") for n in dependencies), dependencies
    assert not any(re.search(r"(^|/)\.env($|[.])", n) for n in names), "Credential file packaged"
    assert not any(n.startswith(('extension/tmp/', 'extension/output/')) for n in names), "Generated artifacts packaged"
    assert json.loads(archive.read('extension/agents/forge-agent-fallback.json'))['manifest']['model']['name'] == 'groq/gpt-oss-120b', 'Groq fallback manifest missing'
    pkg = json.loads(archive.read("extension/package.json"))
    assert pkg["repository"]["url"] == "https://github.com/s2kumar2007/VS-CODE-EXTENSION.git"
    result = {"ok": True, "file_count": len(names), "bytes": __import__('os').path.getsize(sys.argv[1]), "sha256": hashlib.file_digest(open(sys.argv[1], "rb"), "sha256").hexdigest(), "runtime_dependency_files": dependencies}
    print(json.dumps(result, indent=2))
