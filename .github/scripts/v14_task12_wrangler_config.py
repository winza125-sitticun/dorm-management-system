from __future__ import annotations


class SmokeConfigError(RuntimeError):
    pass


def build_wrangler_config(template: str, pages_name: str, d1_name: str, d1_id: str) -> str:
    rendered = template
    page_placeholder = "REPLACE_WITH_YOUR_PAGES_PROJECT"
    d1_long_placeholder = "REPLACE_WITH_YOUR_D1_DATABASE_NAME"
    d1_short_placeholder = "REPLACE_WITH_YOUR_D1_DATABASE"
    d1_id_placeholder = "00000000-0000-0000-0000-000000000000"

    if rendered.count(page_placeholder) != 1:
        raise SmokeConfigError(f"page placeholder count={rendered.count(page_placeholder)}")
    rendered = rendered.replace(page_placeholder, pages_name)

    if d1_long_placeholder in rendered:
        d1_placeholder = d1_long_placeholder
    elif d1_short_placeholder in rendered:
        d1_placeholder = d1_short_placeholder
    else:
        raise SmokeConfigError("D1 database placeholder missing")
    if rendered.count(d1_placeholder) != 1:
        raise SmokeConfigError(f"D1 placeholder count={rendered.count(d1_placeholder)}")
    rendered = rendered.replace(d1_placeholder, d1_name)

    if rendered.count(d1_id_placeholder) != 1:
        raise SmokeConfigError(f"D1 id placeholder count={rendered.count(d1_id_placeholder)}")
    rendered = rendered.replace(d1_id_placeholder, d1_id)

    if "REPLACE_WITH_YOUR" in rendered or d1_id_placeholder in rendered:
        raise SmokeConfigError("placeholder remains after render")
    return rendered
