'use strict';

/**
 * Default bot signatures and AI referrer domains.
 *
 * Source of truth: spec/default-lists.json
 * Keep in sync across all collectors.
 */

const BOT_SIGNATURES = [
  // OpenAI.
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ChatGPT-Browser', 'Operator',
  // Anthropic.
  'ClaudeBot', 'Claude-Web', 'Claude-SearchBot', 'Claude-User', 'Anthropic-Claude', 'anthropic-ai',
  // Google.
  'Google-Extended', 'GoogleOther', 'GoogleOther-Image', 'GoogleOther-Video',
  'Google-CloudVertexBot', 'GoogleAgent-Mariner', 'Gemini-Deep-Research', 'Google-NotebookLM', 'Googlebot',
  // Perplexity.
  'PerplexityBot', 'Perplexity-User',
  // Meta.
  'meta-externalagent', 'meta-externalfetcher', 'Meta-WebIndexer', 'FacebookBot', 'facebookexternalhit',
  // Microsoft.
  'bingbot', 'CopilotBot', 'MicrosoftPreview', 'AzureAI-SearchBot',
  // Apple.
  'Applebot', 'Applebot-Extended',
  // ByteDance.
  'Bytespider', 'ByteDance', 'TikTokSpider',
  // xAI.
  'GrokBot', 'xAI-Grok', 'Grok-DeepSearch',
  // Amazon.
  'Amazonbot', 'Amzn-SearchBot', 'Amzn-User', 'NovaAct',
  // Others.
  'DuckAssistBot', 'CCBot', 'Diffbot', 'Seekr', 'Spider',
  'cohere-ai', 'cohere-training-data-crawler', 'YouBot', 'MistralAI-User',
  'PetalBot', 'PanguBot', 'ChatGLM-Spider', 'Timpibot', 'ImagesiftBot',
  'AI2Bot', 'Ai2Bot-Dolma', 'Andibot', 'Bravebot', 'PhindBot',
  'LinerBot', 'TavilyBot', 'Kangaroo Bot', 'LinkedInBot',
  'Manus-User', 'kagi-fetcher', 'Cloudflare-AutoRAG', 'VelenPublicWebCrawler',
  'omgili', 'Webzio', 'webzio-extended', 'Nicecrawler', 'ICC-Crawler',
  'Scrapy', 'newspaper', 'AhrefsBot', 'SemrushBot', 'MJ12bot',
  'DotBot', 'Rogerbot', 'Screaming Frog', 'ISSCyberRiskCrawler',
  'Sidetrade', 'Owler', 'DeepSeekBot', 'Mistral', 'Firecrawl', 'Jina',
];

const AI_REFERRERS = [
  'chatgpt.com', 'chat.openai.com',
  'perplexity.ai', 'labs.perplexity.ai',
  'claude.ai',
  'gemini.google.com', 'labs.google', 'aistudio.google.com', 'notebooklm.google.com',
  'copilot.microsoft.com', 'copilot.cloud.microsoft',
  'poe.com', 'you.com', 'phind.com',
  'deepseek.com', 'chat.deepseek.com',
  'grok.x.ai', 'meta.ai', 'chat.mistral.ai',
  'kagi.com', 'andi.com', 'iask.ai',
  'brave.com', 'search.brave.com',
  'character.ai', 'huggingface.co', 'huggingchat.co',
  'grok.com', 'getliner.com', 'liner.com',
];

module.exports = { BOT_SIGNATURES, AI_REFERRERS };
