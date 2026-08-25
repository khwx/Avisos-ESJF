# Avisos ESJF - Portal Não Oficial e Feed RSS

Uma aplicação full-stack criada para modernizar o acesso aos avisos e notícias da **Escola Secundária José Falcão (Coimbra)**. Como o site oficial não disponibiliza um feed RSS nativo, este projeto faz a extração automática (*web scraping*) dos avisos e disponibiliza-os numa interface moderna, juntamente com feeds RSS e notificações de ambiente de trabalho.

## ✨ Funcionalidades

- **Web Scraping Automático:** Extrai em tempo real os avisos publicados na página oficial da escola.
- **Feeds RSS e Atom:** Disponibiliza *endpoints* standard (`/api/rss` e `/api/atom`) que podem ser adicionados a qualquer leitor de RSS (Feedly, Inoreader, etc.).
- **Notificações em Tempo Real:** Suporte para notificações Web Push no browser (com atualizações automáticas a cada 3 minutos quando a página está aberta).
- **Modo Escuro (Dark Mode):** Interface adaptável com suporte a tema claro e escuro, detetando a preferência do sistema operativo e guardando a escolha no `localStorage`.
- **Design Responsivo:** Construído com Tailwind CSS para garantir uma excelente experiência em dispositivos móveis e desktop.

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Lucide React (Ícones).
- **Backend:** Node.js, Express.
- **Scraping & Feeds:** Cheerio (análise do HTML) e Feed (geração dos ficheiros RSS/Atom).

## 🚀 Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18 ou superior)

### Instalação

1. Clone o repositório para a sua máquina local:
   ```bash
   git clone https://github.com/o-seu-utilizador/avisos-esjf.git
   cd avisos-esjf
   ```

2. Instale as dependências do projeto:
   ```bash
   npm install
   ```

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   A aplicação ficará disponível em `http://localhost:3000`.

### Build para Produção

Para gerar a versão de produção (que compila tanto o frontend como o backend num único formato):
```bash
npm run build
npm run start
```

## 📡 Endpoints da API

- `GET /api/avisos` - Retorna a lista de avisos no formato JSON.
- `GET /api/rss` - Retorna o feed no formato RSS 2.0.
- `GET /api/atom` - Retorna o feed no formato Atom 1.0.

## ⚠️ Aviso Legal

Este é um projeto **não oficial** e de código aberto, mantido pela comunidade. Não tem qualquer vínculo institucional com a Escola Secundária José Falcão ou com o Ministério da Educação. Todos os direitos dos conteúdos e informações extraídos pertencem à respetiva instituição.
