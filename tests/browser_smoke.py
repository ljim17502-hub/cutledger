"""Optional real Chromium smoke test; Playwright is a test-only dependency."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parent.parent
with sync_playwright() as playwright, TemporaryDirectory() as tmp:
    executable = os.environ.get("CHROMIUM_PATH")
    browser = playwright.chromium.launch(
        **({"executable_path": executable} if executable else {})
    )
    for width in [1440, 375]:
        context = browser.new_context(viewport={"width": width, "height": 940},
                                      accept_downloads=True,
                                      permissions=["clipboard-read", "clipboard-write"])
        page = context.new_page()
        errors, requests = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: requests.append(request.url))
        page.goto((root / "index.html").as_uri())
        status = page.locator("#status")
        expect(status).to_have_text("Review needed · 2 flagged")
        rows = page.locator("#rows")
        for result in ["Moved", "Approved retime", "Out of bounds"]:
            expect(rows).to_contain_text(result)
        assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
        screenshot = os.environ.get("CUTLEDGER_SCREENSHOT")
        if screenshot and width == 1440:
            page.screenshot(path=screenshot, full_page=True, animations="disabled")
        page.keyboard.press("Tab")
        expect(page.get_by_role("link", name="Skip to inputs")).to_be_focused()
        expect(page.get_by_role("textbox", name="Source cuts")).to_have_value("A 2.000\nB 5.000")
        page.get_by_role("textbox", name="Proposed cuts").fill("A 2.000\nB 6.000")
        expect(status).to_have_text("Cut plan matched")
        page.get_by_role("textbox", name="Source cuts").fill("A 2.000\nB 4.000")
        expect(status).to_have_text("Draft · source not verified")
        expect(page.get_by_role("checkbox")).not_to_be_checked()
        page.get_by_role("button", name="Copy Markdown").click()
        expect(page.locator("#output-note")).to_have_text("Report copied.")
        assert "Source not verified" in page.evaluate("navigator.clipboard.readText()")
        with page.expect_download() as download:
            page.get_by_role("button", name="Download").click()
        path = Path(tmp) / "cut-review.md"
        download.value.save_as(path)
        report = path.read_text()
        assert "Source not verified" in report and "| B | 4.000 s | 6.000 s |" in report
        renew = page.get_by_role("button", name="Approve retimes for this source")
        expect(renew).to_be_disabled()
        expect(page.locator("#approved")).to_have_value("B 6.000")
        page.get_by_role("checkbox").check()
        expect(status).to_have_text("Review needed · 1 flagged")
        expect(rows).not_to_contain_text("Approved retime")
        page.get_by_role("button", name="Copy Markdown").click()
        report = page.evaluate("navigator.clipboard.readText()")
        assert "Existing retime approvals were not applied" in report
        assert "| B | 4.000 s | 6.000 s | — | Moved |" in report
        with page.expect_download() as download:
            page.get_by_role("button", name="Download").click()
        download.value.save_as(path)
        assert path.read_text() == report
        page.get_by_role("textbox", name="Proposed cuts").fill("A 2.000\nB 6.100")
        expect(status).to_have_text("Review needed · 1 flagged")
        page.get_by_role("textbox", name="Proposed cuts").fill("A 2.000\nB 6.000")
        expect(status).to_have_text("Review needed · 1 flagged")
        renew.click()
        expect(status).to_have_text("Cut plan matched")
        expect(renew).not_to_be_visible()
        page.get_by_role("textbox", name="Proposed cuts").fill("A 2.000\nB 6.100")
        expect(status).to_have_text("Review needed · 1 flagged")
        page.get_by_role("textbox", name="Proposed cuts").fill("A 2.000\nB 6.000")
        expect(status).to_have_text("Cut plan matched")
        page.locator("#duration").fill("9")
        page.get_by_role("checkbox").check()
        expect(status).to_have_text("Review needed · 1 flagged")
        expect(renew).to_be_enabled()
        page.get_by_role("textbox", name="Source cuts").fill("A 2.000\nA 3.000")
        expect(status).to_have_text("Fix the inputs to compare cuts")
        expect(page.get_by_role("button", name="Download")).to_be_disabled()
        page.get_by_role("button", name="Load 8-second demo").click()
        expect(status).to_have_text("Review needed · 2 flagged")
        assert not errors, errors
        assert all(url.startswith(("file:", "blob:")) for url in requests), requests
        context.close()
    browser.close()
    print("Desktop + 375 px Chromium passed (file://, matching, reset, draft, approval renewal, invalid, keyboard, Markdown copy/download, no network).")
