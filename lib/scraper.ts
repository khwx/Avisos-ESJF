import * as cheerio from "cheerio";
import { Feed } from "feed";

const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatPtDate(d: Date): string {
  return `${d.getDate()} ${PT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Fonte oficial: feed RSS da escola (IDs estáveis via guid, datas reais)
// Fallback: scraping do HTML caso o feed falhe
async function getAvisosFromFeed(): Promise<any[]> {
  const response = await fetch("https://esjf.edu.pt/feed.php", {
    headers: { 'User-Agent': 'AvisosESJF/1.0 (+https://avisos-esjf.vercel.app)' },
  });
  if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const avisos: any[] = [];

  $("item").each((_, element) => {
    const el = $(element);
    const title = el.find("title").first().text().trim();
    const guid = el.find("guid").first().text().trim();
    const link = el.find("link").first().text().trim() || "https://esjf.edu.pt/avisos.php";
    const category = el.find("category").first().text().trim() || "Geral";
    const pubDate = el.find("pubDate").first().text().trim();
    // description pode conter HTML -> extrai só o texto
    const descHtml = el.find("description").first().text().trim();
    const content = cheerio.load(descHtml).text().trim().slice(0, 2000);

    if (!title) return;

    let date = "";
    try {
      const parsed = new Date(pubDate);
      if (!isNaN(parsed.getTime())) date = formatPtDate(parsed);
    } catch {}
    if (!date) date = pubDate;

    avisos.push({
      id: guid || encodeURIComponent(title + date),
      title,
      category,
      date,
      content,
      link,
    });
  });

  if (avisos.length === 0) throw new Error("Feed vazio");
  return avisos;
}

async function getAvisosFromHtml(): Promise<any[]> {
  const response = await fetch("https://esjf.edu.pt/avisos.php");
  const html = await response.text();
  const $ = cheerio.load(html);
  const avisos: any[] = [];

  $("article.aviso").each((_, element) => {
    const el = $(element);
    const title = el.find("h3").first().text().trim();
    const category = el.find(".aviso-cat").text().trim();
    const date = el.find(".data").text().trim();
    const content = el.find("p:not(.aviso-acao, .data, .intro)").text().trim();

    const linkEl = el.find(".aviso-acao a");
    const link = linkEl.length > 0 ? linkEl.attr("href") : "https://esjf.edu.pt/avisos.php";
    // fix relative links
    const fullLink = link?.startsWith("http") ? link : `https://esjf.edu.pt/${link}`;

    const id = encodeURIComponent(title + date);

    avisos.push({
      id,
      title,
      category,
      date,
      content,
      link: fullLink
    });
  });

  return avisos;
}

// Scrape function
export async function getAvisos() {
  try {
    return await getAvisosFromFeed();
  } catch (error) {
    console.error("Feed oficial falhou, fallback para HTML:", error);
    try {
      return await getAvisosFromHtml();
    } catch (error2) {
      console.error("Error scraping avisos:", error2);
      return [];
    }
  }
}

// Generate RSS Feed
export async function generateRSS() {
  const avisos = await getAvisos();
  
  const feed = new Feed({
    title: "Avisos - Escola Secundária José Falcão",
    description: "Todos os avisos e notícias da Escola Secundária José Falcão para alunos e encarregados de educação.",
    id: "https://esjf.edu.pt/avisos.php",
    link: "https://esjf.edu.pt/avisos.php",
    language: "pt",
    image: "https://avisos-esjf.vercel.app/icon-192.png",
    favicon: "https://avisos-esjf.vercel.app/icon-192.png",
    copyright: "All rights reserved, ESJF",
    updated: new Date(),
    generator: "ESJF RSS Feeder",
    author: {
      name: "Escola Secundária José Falcão",
      link: "https://esjf.edu.pt/"
    }
  });

  avisos.forEach(aviso => {
    const ptMonths: Record<string, string> = {
      'jan': 'Jan', 'fev': 'Feb', 'mar': 'Mar', 'abr': 'Apr', 'mai': 'May', 'jun': 'Jun',
      'jul': 'Jul', 'ago': 'Aug', 'set': 'Sep', 'out': 'Oct', 'nov': 'Nov', 'dez': 'Dec'
    };
    
    let dateObj = new Date();
    try {
      const parts = aviso.date.split(' ');
      if (parts.length === 3) {
        const [day, ptMonth, year] = parts;
        const enMonth = ptMonths[ptMonth.toLowerCase()] || ptMonth;
        const parsed = new Date(`${day} ${enMonth} ${year}`);
        if (!isNaN(parsed.getTime())) {
          dateObj = parsed;
        }
      }
    } catch(e) {}

    feed.addItem({
      title: aviso.title,
      id: aviso.id,
      link: aviso.link,
      description: aviso.content,
      content: `${aviso.category} - ${aviso.date}\n\n${aviso.content}`,
      author: [
        {
          name: "ESJF",
          link: "https://esjf.edu.pt/"
        }
      ],
      date: dateObj,
    });
  });

  return feed;
}
