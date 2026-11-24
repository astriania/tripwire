// The four chain layouts place our cards without any two overlapping. The
// three canvas layouts (tree top, tree left, radial) measure each card to
// space their grid and rings; measured outside the chain panel the card came
// out as upstream's 5em pill and the real cards piled onto each other.
const { test } = require("@playwright/test");
const { login, expect } = require("./helpers");

const LAYOUTS = ["orgChartTop", "orgChartSide", "radial", "orgChart"];

// Visible cards on the chain map and how many pairs of them overlap.
async function cardsAndOverlaps(page) {
	return page.evaluate(() => {
		const cards = [...document.querySelectorAll("#chainMap div.node")].map(n => n.getBoundingClientRect())
			.filter(r => r.width && r.height);
		let overlaps = 0;
		for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
			const a = cards[i], b = cards[j];
			if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
		}
		return { cards: cards.length, overlaps, widths: cards.map(r => Math.round(r.width)) };
	});
}

test("every chain layout places the cards clear of each other", async ({ page }) => {
	await login(page, "Perimeter");
	const original = await page.evaluate(() => options.chain.renderer);
	try {
		const seen = {};
		for (const layout of LAYOUTS) {
			await page.evaluate((r) => { options.chain.renderer = r; chain.useRenderer(r); chain.redraw(); }, layout);
			await page.waitForTimeout(1500);
			seen[layout] = await cardsAndOverlaps(page);
			expect(seen[layout].overlaps, layout + " overlaps").toBe(0);
		}
		// Same cards in every layout: nothing measured in secret is left on the map
		const counts = new Set(LAYOUTS.map(l => seen[l].cards));
		expect([...counts], "card count per layout").toHaveLength(1);
		// A card on the canvas layouts is sized as it is on the classic tree, not shrunk to its minimum
		for (const layout of LAYOUTS.slice(0, 3)) {
			expect(Math.max(...seen[layout].widths), layout + " widest card").toBeGreaterThanOrEqual(Math.max(...seen.orgChart.widths) - 2);
		}
		test.info().annotations.push({ type: "cards on the map", description: String(seen.orgChart.cards) });
	} finally {
		await page.evaluate((r) => { options.chain.renderer = r; chain.useRenderer(r); chain.redraw(); }, original);
	}
});

// The first draw waits for the charts to load. A poll that lands meanwhile
// says who is where and carries no map; it used to take the waiting draw's
// place, and the chain stayed blank until someone changed a signature.
test("a draw that has to wait is not lost to the next one", async ({ page }) => {
	await login(page, "Perimeter");
	await page.waitForFunction(() => chain.data.rawMap, null, { timeout: 15000 });
	const seen = await page.evaluate(async () => {
		const real = chain.renderer, drawn = [], keep = $.extend(true, {}, chain.data.rawMap), sleep = ms => new Promise(r => setTimeout(r, ms));
		let ready = false;
		const size = () => Object.keys(chain.data.rawMap || {}).length;
		// Three maps that can be told apart by their size.
		const some = n => { const o = {}; Object.keys(keep).slice(0, n).forEach(k => { o[k] = $.extend(true, {}, keep[k]); }); return o; };
		chain.renderer = { ready: () => ready, switchTo() {}, switchFrom() {}, draw: map => drawn.push(map.rows.length) };
		const useRenderer = chain.useRenderer; chain.useRenderer = () => {};
		const out = { maps: Object.keys(keep).length };
		try {
			chain.data.rawMap = undefined;
			chain.draw({ map: some(3), occupied: null, flares: null });
			chain.draw({ map: null, occupied: [], flares: null });          // the poll
			await sleep(250); ready = true; await sleep(250);
			out.poll = size();
			ready = false;
			chain.draw({ map: some(2) });
			chain.redraw();                                                 // what is drawn now is older than what waits
			await sleep(250); ready = true; await sleep(250);
			out.redraw = size();
			ready = false;
			chain.draw({ map: some(3) });
			chain.draw({ map: some(1) });                                   // and a newer map still wins
			await sleep(250); ready = true; await sleep(250);
			out.newer = size();
			const n = drawn.length; await sleep(400);
			out.settled = drawn.length === n;                               // nothing left going round
		} finally { chain.renderer = real; chain.useRenderer = useRenderer; chain.draw({ map: keep }); }
		return out;
	});
	test.skip(seen.maps < 3, "needs a map with three connections");
	expect(seen).toEqual({ maps: seen.maps, poll: 3, redraw: 2, newer: 1, settled: true });
});
