import { chromium, Browser } from 'playwright-core';

/**
 * Render arbitrary HTML to PDF using headless Chromium.
 * Returns a Buffer.
 */
export async function exportHtmlToPdf(html: string): Promise<Buffer> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // Ensure full-width printable layout
    await page.setContent(
      `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.35; }
    img { max-width: 100%; }
    h1,h2,h3 { margin-top: 1.2em; }
  </style>
</head>
<body>
${html}
</body>
</html>
      `,
      { waitUntil: 'load' },
    );

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
    });

    await page.close();
    await browser.close();
    return pdf;
  } catch (err) {
    if (browser) await browser.close();
    throw err;
  }
}

