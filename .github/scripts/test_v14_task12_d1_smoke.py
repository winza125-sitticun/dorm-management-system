import importlib.util
import json
import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MODULE_PATH = SCRIPT_DIR / "v14_task12_d1_smoke.py"
spec = importlib.util.spec_from_file_location("v14_task12_d1_smoke", MODULE_PATH)
smoke = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = smoke
spec.loader.exec_module(smoke)


class SmokeHelpersTest(unittest.TestCase):
    def test_extract_api_data_requires_success(self):
        self.assertEqual(smoke.extract_api_data({"success": True, "data": {"x": 1}}), {"x": 1})
        with self.assertRaises(smoke.SmokeFailure):
            smoke.extract_api_data({"success": False, "error": {"code": "X"}})

    def test_build_wrangler_config_replaces_only_placeholders(self):
        template = '{"name":"REPLACE_WITH_YOUR_PAGES_PROJECT","d1_databases":[{"binding":"DB","database_name":"REPLACE_WITH_YOUR_D1_DATABASE","database_id":"00000000-0000-0000-0000-000000000000"}]}'
        rendered = smoke.build_wrangler_config(
            template,
            "pages-test",
            "db-test",
            "11111111-1111-1111-1111-111111111111",
        )
        self.assertIn('"name":"pages-test"', rendered)
        self.assertIn('"database_name":"db-test"', rendered)
        self.assertIn('"database_id":"11111111-1111-1111-1111-111111111111"', rendered)
        self.assertNotIn("REPLACE_WITH_YOUR", rendered)
        self.assertNotIn("00000000-0000-0000-0000-000000000000", rendered)

    def test_parse_wrangler_json_accepts_prefixed_output(self):
        payload = [{"results": [{"id": 1}], "success": True}]
        parsed = smoke.parse_wrangler_json("wrangler info line\n" + json.dumps(payload))
        self.assertEqual(parsed, payload)

    def test_sql_quote_escapes_single_quote(self):
        self.assertEqual(smoke.sql_quote("O'Reilly"), "'O''Reilly'")

    def test_sanitize_evidence_blocks_secret_keys_recursively(self):
        evidence = {
            "jwt": "bad",
            "restoreToken": "bad",
            "lineSecret": "bad",
            "ok": True,
            "nested": {"googleRefreshToken": "bad", "count": 2},
        }
        clean = smoke.sanitize_evidence(evidence)
        self.assertEqual(clean, {"ok": True, "nested": {"count": 2}})

    def test_assert_no_store(self):
        smoke.assert_no_store({"cache-control": "no-store"}, "backup export")
        smoke.assert_no_store({"Cache-Control": "no-store, max-age=0"}, "backup export")
        with self.assertRaises(smoke.SmokeFailure):
            smoke.assert_no_store({"cache-control": "public"}, "backup export")


if __name__ == "__main__":
    unittest.main()
