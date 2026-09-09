import * as cheerio from "cheerio";
import { Feed } from "feed";

// Scrape function
export async function getAvisos() {
  try {
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
  } catch (error) {
    console.error("Error scraping avisos:", error);
    return [];
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
    image: "https://esjf.edu.pt/assets/img/favicon-esjf.png",
    favicon: "https://esjf.edu.pt/assets/img/favicon-esjf.png",
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
