const express = require('express')
const puppeteer = require('puppeteer')
const minify = require('html-minifier').minify;

const app = express()

const RENDER_CACHE = new Map();

let browserWSEndpoint = null;

app.get('*', async (req, res) => {
  try {
    if (!browserWSEndpoint) {
      const browser = await puppeteer.launch();
      browserWSEndpoint = await browser.wsEndpoint();
    }
    const {html, ttRenderMs} = await ssr(`https://blog.korolr.me/${req.url}`);
    // Add Server-Timing! See https://w3c.github.io/server-timing/.
    res.set('Server-Timing', `Prerender;dur=${ttRenderMs};desc="Headless render time (ms)"`);
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(err)
  }
})

app.listen(3000, () => {
  console.log('listen http://localhost:3000')
})


async function ssr(url) {
  if (RENDER_CACHE.has(url)) {
    return {html: RENDER_CACHE.get(url), ttRenderMs: 0};
  }

  const start = Date.now();

  const browser = await puppeteer.connect({ browserWSEndpoint })
  const page = await browser.newPage();
  try {
    // networkidle0 waits for the network to be idle (no requests for 500ms).
    // The page's JS has likely produced markup by this point, but wait longer
    // if your site lazy loads, etc.
    await page.goto(url, {waitUntil: 'networkidle0'});
  } catch (err) {
    console.error(err);
    throw new Error('page.goto/waitForSelector timed out.');
  }

  const html = minify(await page.content(), {
    collapseWhitespace: true,
    removeComments: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeTagWhitespace: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: true,
  }); // serialized HTML of page DOM.

  const ttRenderMs = Date.now() - start;
  console.info(`Headless rendered page in: ${ttRenderMs}ms`);

  RENDER_CACHE.set(url, html); // cache rendered page.

  return {html, ttRenderMs};
}