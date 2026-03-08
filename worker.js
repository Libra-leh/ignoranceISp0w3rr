export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    if (!q) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    const fahasaUrl =
      "https://www.fahasa.com/catalogsearch/result/?q=" + encodeURIComponent(q);

    const res = await fetch(fahasaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8"
      }
    });

    const html = await res.text();
    const items = parseFahasa(html);

    return new Response(JSON.stringify({ items }), {
      headers: {
        "Content-Type": "application/json",
        ...cors
      }
    });
  }
};

function parseFahasa(html) {
  const items = [];

  // Fahasa Magento product items — extract each product block
  // Products are wrapped in <li class="item product product-item"> or similar
  const productBlocks = html.match(/<li[^>]*class="[^"]*product[^"]*item[^"]*"[^>]*>[\s\S]*?<\/li>/gi) || [];

  for (const block of productBlocks) {
    try {
      // Title — in <a class="product-item-link"> or <strong class="product-name">
      let title = '';
      const titleM = block.match(/class="[^"]*product-item-link[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/i)
                  || block.match(/class="[^"]*product-name[^"]*"[^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i);
      if (titleM) title = stripTags(titleM[1]).trim();
      if (!title) continue;

      // Cover image — prefer data-src (lazy loaded) then src
      let thumb = '';
      const imgM = block.match(/<img[^>]+(?:data-src|src)="([^"]*fahasa[^"]*|[^"]*fhs[^"]*|[^"]*product[^"]*\.(jpg|jpeg|png|webp))[^"]*"/i)
                || block.match(/<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);
      if (imgM) thumb = imgM[1].replace(/^http:\/\//, 'https://');

      // Author — often in a span or div with class containing "author"
      let author = '';
      const authM = block.match(/class="[^"]*author[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/(?:span|div|p|a)>/i)
                 || block.match(/Tác giả[^:]*:\s*<[^>]*>\s*([\s\S]*?)\s*<\//i);
      if (authM) author = stripTags(authM[1]).trim();

      // Product URL
      let link = '';
      const linkM = block.match(/href="(https?:\/\/[^"]*fahasa[^"]*)"/i);
      if (linkM) link = linkM[1];

      items.push({
        _source: 'cf',
        volumeInfo: {
          title,
          authors: author ? [author] : [],
          publishedDate: '',
          categories: [],
          language: 'vi',
          imageLinks: thumb ? { thumbnail: thumb } : null,
          infoLink: link
        }
      });

      if (items.length >= 10) break;
    } catch (e) {
      // skip malformed block
    }
  }

  // Fallback: if Magento li blocks not found, try JSON-LD or window.__DATA__
  if (!items.length) {
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
    for (const block of jsonLd) {
      try {
        const inner = block.replace(/<[^>]+>/g, '');
        const data = JSON.parse(inner);
        const products = data['@graph']
          ? data['@graph'].filter(x => x['@type'] === 'Product')
          : data['@type'] === 'Product' ? [data] : [];
        for (const p of products) {
          items.push({
            _source: 'cf',
            volumeInfo: {
              title: p.name || '',
              authors: p.author ? [p.author] : [],
              publishedDate: '',
              categories: [],
              language: 'vi',
              imageLinks: p.image ? { thumbnail: p.image } : null,
              infoLink: p.url || ''
            }
          });
          if (items.length >= 10) break;
        }
      } catch (e) {}
      if (items.length) break;
    }
  }

  return items;
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
}
