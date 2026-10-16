"""Check that recovered legacy helpers accept the current native env contract."""
import ast
import importlib.util
from pathlib import Path
import re
import tempfile
from types import SimpleNamespace
import unittest
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("dotenv_data", ROOT / "scripts/deploy/dotenv-data.py")
DOTENV = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DOTENV)


def native_environments():
    # Compile only the two pure generators, never the controller's host imports.
    source = ast.parse((ROOT / "scripts/deploy/gce-host/native_runtime_app.py").read_text())
    generators = [node for node in source.body if isinstance(node, ast.FunctionDef)
                  and node.name in {"fixed_environment", "web_environment_bytes"}]
    if len(generators) != 2:
        raise AssertionError("Native environment generators changed; review this contract")
    namespace = {"quote": quote, "migration": SimpleNamespace(ROLE="synthetic_role", DATABASE="synthetic_database")}
    exec(compile(ast.Module(body=generators, type_ignores=[]), "native-env-generators", "exec"), namespace)
    identity = {"commit": "1" * 40, "tree": "2" * 40, "release": "synthetic-" + "1" * 12,
                "buildTime": "2026-10-16T00:00:00Z"}
    api = namespace["fixed_environment"]({"password": "synthetic-only"}, "synthetic-only", identity)
    web = dict(line.split("=", 1) for line in namespace["web_environment_bytes"](identity).decode().splitlines())
    return api, web


class ConsolidatedEnvProfiles(unittest.TestCase):
    def parse_values(self, values, profile):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.env"
            path.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
            path.chmod(0o600)
            return DOTENV.parse(path, DOTENV.PROFILES[profile])[0]

    def test_current_native_api_environment_round_trips(self):
        api, _ = native_environments()
        self.assertEqual(self.parse_values(api, "api"), api)

    def test_current_native_web_environment_round_trips(self):
        _, web = native_environments()
        self.assertEqual(self.parse_values(web, "web"), web)

    def test_web_profile_rejects_api_credentials(self):
        with self.assertRaises(DOTENV.DotenvError):
            self.parse_values({"DATABASE_URL": "postgresql://synthetic.invalid/example"}, "web")

    def test_api_profile_rejects_runtime_code_injection_keys(self):
        with self.assertRaises(DOTENV.DotenvError):
            self.parse_values({"NODE_OPTIONS": "--require=untrusted.cjs"}, "api")

    def test_release_value_remains_literal_data(self):
        value = "synthetic;$(printf-untrusted)`printf-untrusted`"
        self.assertEqual(self.parse_values({"EXPECTED_RELEASE": value}, "api")["EXPECTED_RELEASE"], value)

    def test_recovered_nginx_access_logs_exclude_query_and_referrer(self):
        for name in ["all-too-well.com.placeholder.conf", "compose.staging.conf",
                     "feishu-timeline.conf", "timeline.all-too-well.com.conf"]:
            with self.subTest(configuration=name):
                source = (ROOT / "deploy/nginx" / name).read_text()
                formats = re.findall(r"log_format\s+\w+\s+(.+?);", source, re.S)
                self.assertTrue(formats)
                for definition in formats:
                    for forbidden in ["$request_uri", "$args", "$query_string", "$http_referer"]:
                        self.assertNotIn(forbidden, definition)
                    self.assertIsNone(re.search(r"\$request(?![A-Za-z_])", definition))
                self.assertRegex(source, r"(?m)^\s*access_log\s+[^;]+\s+\w+_no_args;")


if __name__ == "__main__":
    unittest.main()
