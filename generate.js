import Anthropic from '@anthropic-ai/sdk';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';

const CONFIG = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  finnhubApiKey: process.env.FINNHUB_API_KEY,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  recipientEmail: process.env.RECIPIENT_EMAIL,
  
  symbols: {
    indices: ['SPY', 'QQQ', 'DIA', 'IWM'],
    majors: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META'],
    sectors: ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLRE', 'XLB', 'XLU', 'XLC']
  }
};

const anthropic = new Anthropic({
  apiKey: CONFIG.anthropicApiKey
});

async function fetchMarketData(symbol) {
  try {
    const quote = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${CONFIG.finnhubApiKey}`
    ).then(res => res.json());
    
    return {
      symbol,
      current: quote.c,
      change: quote.d,
      changePercent: quote.dp,
      high: quote.h,
      low: quote.l,
      open: quote.o,
      previousClose: quote.pc
    };
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error.message);
    return null;
  }
}

async function fetchMarketNews() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const from = yesterday.toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&from=${from}&to=${to}&token=${CONFIG.finnhubApiKey}`
    ).then(res => res.json());
    
    return response.slice(0, 20).map(item => ({
      headline: item.headline,
      summary: item.summary,
      source: item.source,
      url: item.url,
      datetime: new Date(item.datetime * 1000).toISOString()
    }));
  } catch (error) {
    console.error('Error fetching news:', error.message);
    return [];
  }
}

async function fetchEarningsCalendar() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${today}&token=${CONFIG.finnhubApiKey}`
    ).then(res => res.json());
    
    return response.earningsCalendar?.slice(0, 10) || [];
  } catch (error) {
    console.error('Error fetching earnings:', error.message);
    return [];
  }
}

async function collectMarketData() {
  console.log('Collecting market data...');
  
  const allSymbols = [
    ...CONFIG.symbols.indices,
    ...CONFIG.symbols.majors,
    ...CONFIG.symbols.sectors
  ];
  
  const marketData = [];
  for (let i = 0; i < allSymbols.length; i++) {
    const data = await fetchMarketData(allSymbols[i]);
    if (data) marketData.push(data);
    
    if (i < allSymbols.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  const news = await fetchMarketNews();
  const earnings = await fetchEarningsCalendar();
  
  return {
    timestamp: new Date().toISOString(),
    marketData,
    news,
    earnings
  };
}

async function generateAnalysis(data) {
  console.log('Generating AI analysis...');
  
  const indicesData = data.marketData.filter(d => CONFIG.symbols.indices.includes(d.symbol));
  const sectorsData = data.marketData.filter(d => CONFIG.symbols.sectors.includes(d.symbol));
  const majorsData = data.marketData.filter(d => CONFIG.symbols.majors.includes(d.symbol));
  
  const prompt = `You are an expert financial analyst. Analyze the following market data and news from the previous market close to now, and create a comprehensive pre-market report for professional traders.

MAJOR INDICES:
${JSON.stringify(indicesData, null, 2)}

MAJOR STOCKS:
${JSON.stringify(majorsData, null, 2)}

SECTOR ETFS:
${JSON.stringify(sectorsData, null, 2)}

OVERNIGHT NEWS:
${JSON.stringify(data.news, null, 2)}

EARNINGS TODAY:
${JSON.stringify(data.earnings, null, 2)}

Create a detailed analysis with these EXACT sections (use these exact titles):

EXECUTIVE SUMMARY
Write 3-4 sentences summarizing overall market sentiment, key overnight developments, and the trading outlook for today.

MAJOR INDICES ANALYSIS
Analyze SPY, QQQ, DIA, and IWM performance. Include specific price levels, percentage changes, technical levels, and momentum indicators.

TOP HEADLINES
List and analyze the 5-7 most important news stories. For each headline, provide: the headline itself, why it matters, and potential market impact.

SECTOR PERFORMANCE
Analyze all 11 sectors (XLK, XLF, XLE, XLV, XLI, XLY, XLP, XLRE, XLB, XLU, XLC). Identify leaders, laggards, and rotation trends. Use specific percentages.

PRE-MARKET MOVERS
Identify the biggest gainers and losers from the major stocks list. Include catalysts and volume analysis.

EARNINGS CALENDAR
Summarize companies reporting today and expected market impact.

ECONOMIC EVENTS
List important economic data releases or events scheduled for today.

RISK ASSESSMENT
Identify key risks, volatility indicators, and critical support/resistance levels to watch.

TRADING OPPORTUNITIES
Provide 3-5 specific trading ideas or setups based on the overnight action. Include entry considerations and key levels.

BOTTOM LINE
Provide a clear, actionable conclusion with: market bias (bullish/bearish/neutral), key catalysts for the day, and 2-3 must-watch items.

Keep each section concise, data-driven, and professional. Use specific numbers and percentages throughout.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    return message.content[0].text;
  } catch (error) {
    console.error('Error generating analysis:', error.message);
    throw error;
  }
}

function formatEmailHTML(analysis, data) {
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const sectionIcons = {
    'EXECUTIVE SUMMARY': '📋',
    'MAJOR INDICES ANALYSIS': '📊',
    'TOP HEADLINES': '📰',
    'SECTOR PERFORMANCE': '🏭',
    'PRE-MARKET MOVERS': '🚀',
    'EARNINGS CALENDAR': '💼',
    'ECONOMIC EVENTS': '📅',
    'RISK ASSESSMENT': '⚠️',
    'TRADING OPPORTUNITIES': '💡',
    'BOTTOM LINE': '🎯'
  };
  
  const sectionColors = {
    'EXECUTIVE SUMMARY': '#8B5CF6',
    'MAJOR INDICES ANALYSIS': '#3B82F6',
    'TOP HEADLINES': '#EF4444',
    'SECTOR PERFORMANCE': '#10B981',
    'PRE-MARKET MOVERS': '#F59E0B',
    'EARNINGS CALENDAR': '#6366F1',
    'ECONOMIC EVENTS': '#EC4899',
    'RISK ASSESSMENT': '#DC2626',
    'TRADING OPPORTUNITIES': '#059669',
    'BOTTOM LINE': '#D4AF37'
  };
  
  const sections = analysis.split(/\n(?=[A-Z\s]+\n)/);
  
  let htmlContent = sections.map(section => {
    const lines = section.split('\n');
    const title = lines[0].trim();
    
    if (sectionIcons[title]) {
      const content = lines.slice(1).join('\n');
      const icon = sectionIcons[title];
      const color = sectionColors[title];
      
      let formattedContent = content
        .replace(/^-\s+(.+)$/gm, '<li style="margin-bottom: 10px; line-height: 1.6;">$1</li>')
        .replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, '<ul style="margin: 16px 0; padding-left: 24px; list-style-type: disc;">function formatEmailHTML(analysis, data) {
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const sections = analysis.split(/\n(?=\d+\.\s+[A-Z\s]+)/);
  
  let htmlContent = sections.map(section => {
    const match = section.match(/^(\d+)\.\s+([A-Z\s]+)/);
    if (match) {
      const [, number, title] = match;
      let content = section.replace(/^\d+\.\s+[A-Z\s]+\n/, '');
      
      content = content
        .replace(/^-\s+(.+)$/gm, '<li style="margin-bottom: 8px;">$1</li>')
        .replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, '<ul style="margin: 12px 0; padding-left: 20px;">$&</ul>')
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color: #1a1a1a;">$1</strong>')
        .split('\n\n')
        .map(para => para.trim() ? `<p style="margin: 0 0 12px 0; line-height: 1.7;">${para.replace(/\n/g, '<br>')}</p>` : '')
        .join('');
      
      return `
        <div style="margin-bottom: 40px; page-break-inside: avoid;">
          <div style="background: linear-gradient(90deg, #D4AF37 0%, #F4D03F 100%); padding: 12px 20px; margin-bottom: 20px; border-radius: 4px;">
            <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: 0.5px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
              ${number}. ${title}
            </h2>
          </div>
          <div style="color: #2c3e50; font-size: 15px; line-height: 1.7; padding: 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            ${content}
          </div>
        </div>
      `;
    }
    return `<div style="color: #2c3e50; line-height: 1.7; margin-bottom: 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">${section}</div>`;
  }).join('');
  
  const majorIndices = data.marketData.filter(d => CONFIG.symbols.indices.includes(d.symbol));
  const summaryCards = majorIndices.map(index => {
    const changeColor = index.changePercent >= 0 ? '#10b981' : '#ef4444';
    const changeSymbol = index.changePercent >= 0 ? '▲' : '▼';
    return `
      <div style="flex: 1; min-width: 150px; background: #f8f9fa; padding: 16px; border-radius: 8px; text-align: center; border-left: 4px solid ${changeColor};">
        <div style="font-size: 13px; color: #6c757d; font-weight: 600; margin-bottom: 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">${index.symbol}</div>
        <div style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">$${index.current?.toFixed(2) || 'N/A'}</div>
        <div style="font-size: 14px; font-weight: 600; color: ${changeColor}; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          ${changeSymbol} ${index.changePercent?.toFixed(2) || '0.00'}%
        </div>
      </div>
    `;
  }).join('');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Market Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f0f2f5;">
  <div style="max-width: 900px; margin: 0 auto; background-color: #ffffff;">
    
    <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #2d2d2d 100%); color: #ffffff; padding: 50px 40px; position: relative; overflow: hidden;">
      <div style="position: relative; z-index: 1;">
        <div style="font-size: 14px; color: #D4AF37; font-weight: 600; letter-spacing: 2px; margin-bottom: 12px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">INSTITUTIONAL RESEARCH</div>
        <h1 style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -0.5px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.1;">
          Daily Market Report
        </h1>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 2px solid #D4AF37;">
          <p style="margin: 0; font-size: 18px; color: #D4AF37; font-weight: 600; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            ${formattedDate}
          </p>
          <p style="margin: 8px 0 0 0; font-size: 14px; color: #b0b0b0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            Market Analysis • Generated at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
          </p>
        </div>
      </div>
      <div style="position: absolute; top: -50px; right: -50px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(212,175,55,0.1) 0%, rgba(212,175,55,0) 70%); border-radius: 50%;"></div>
    </div>
    
    <div style="background: #ffffff; padding: 30px 40px; border-bottom: 1px solid #e5e7eb;">
      <h3 style="margin: 0 0 20px 0; font-size: 16px; color: #6c757d; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">Market Snapshot</h3>
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        ${summaryCards}
      </div>
    </div>
    
    <div style="padding: 50px 40px; background: #ffffff;">
      ${htmlContent}
    </div>
    
    <div style="background: #f8f9fa; padding: 40px; border-top: 3px solid #D4AF37;">
      <div style="max-width: 700px; margin: 0 auto; text-align: center;">
        <div style="margin-bottom: 20px;">
          <div style="display: inline-block; background: #1a1a1a; color: #D4AF37; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 1px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            POWERED BY AI
          </div>
        </div>
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #6c757d; line-height: 1.6; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          This report is generated automatically using real-time market data from Finnhub<br>and advanced AI analysis from Anthropic Claude.
        </p>
        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #dee2e6;">
          <p style="margin: 0; font-size: 12px; color: #868e96; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            <strong style="color: #495057;">IMPORTANT DISCLAIMER:</strong> This report is for informational purposes only and does not constitute investment advice, financial advice, trading advice, or any other sort of advice. You should not treat any of the report's content as such. Do your own research and consult with a licensed financial advisor before making any investment decisions.
          </p>
        </div>
      </div>
    </div>
    
  </div>
</body>
</html>
  `;
}</ul>')
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color: #1a1a1a; font-weight: 700;">$1</strong>')
        .split('\n\n')
        .filter(p => p.trim())
        .map(para => {
          para = para.trim();
          if (!para.startsWith('<ul') && !para.startsWith('<li')) {
            return `<p style="margin: 0 0 14px 0; line-height: 1.8; color: #374151;">${para.replace(/\n/g, '<br>')}</p>`;
          }
          return para;
        })
        .join('');
      
      return `
        <div style="margin-bottom: 45px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e5e7eb;">
          <div style="background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%); padding: 18px 28px; display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">${icon}</span>
            <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: 0.3px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,0.1);">
              ${title}
            </h2>
          </div>
          <div style="padding: 28px; font-size: 15px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            ${formattedContent}
          </div>
        </div>
      `;
    }
    return '';
  }).filter(s => s).join('');
  
  const majorIndices = data.marketData.filter(d => CONFIG.symbols.indices.includes(d.symbol));
  const summaryCards = majorIndices.map(index => {
    const changeColor = index.changePercent >= 0 ? '#10b981' : '#ef4444';
    const changeSymbol = index.changePercent >= 0 ? '▲' : '▼';
    const changeBg = index.changePercent >= 0 ? '#d1fae5' : '#fee2e2';
    
    return `
      <div style="flex: 1; min-width: 160px; background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%); padding: 20px; border-radius: 12px; text-align: center; border: 2px solid ${changeColor}; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
        <div style="font-size: 14px; color: #6b7280; font-weight: 700; margin-bottom: 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.5px;">${index.symbol}</div>
        <div style="font-size: 26px; font-weight: 800; color: #111827; margin-bottom: 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">${index.current?.toFixed(2) || 'N/A'}</div>
        <div style="display: inline-block; background: ${changeBg}; padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: 700; color: ${changeColor}; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          ${changeSymbol} ${Math.abs(index.changePercent || 0).toFixed(2)}%
        </div>
      </div>
    `;
  }).join('');
  
  const topMovers = data.marketData
    .filter(d => CONFIG.symbols.majors.includes(d.symbol))
    .sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0))
    .slice(0, 5);
    
  const moversCards = topMovers.map(stock => {
    const changeColor = stock.changePercent >= 0 ? '#10b981' : '#ef4444';
    const changeSymbol = stock.changePercent >= 0 ? '▲' : '▼';
    
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: #f9fafb; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${changeColor};">
        <div>
          <div style="font-size: 16px; font-weight: 700; color: #111827; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">${stock.symbol}</div>
          <div style="font-size: 13px; color: #6b7280; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">${stock.current?.toFixed(2) || 'N/A'}</div>
        </div>
        <div style="font-size: 16px; font-weight: 700; color: ${changeColor}; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          ${changeSymbol} ${Math.abs(stock.changePercent || 0).toFixed(2)}%
        </div>
      </div>
    `;
  }).join('');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Market Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
  <div style="max-width: 920px; margin: 0 auto; background-color: #f8fafc;">
    
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: #ffffff; padding: 60px 40px; position: relative; overflow: hidden;">
      <div style="position: relative; z-index: 1;">
        <div style="display: inline-block; background: rgba(212, 175, 55, 0.2); border: 2px solid #D4AF37; padding: 8px 20px; border-radius: 30px; margin-bottom: 20px;">
          <span style="font-size: 13px; color: #D4AF37; font-weight: 700; letter-spacing: 2px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">INSTITUTIONAL RESEARCH</span>
        </div>
        <h1 style="margin: 0; font-size: 48px; font-weight: 900; letter-spacing: -1px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.1; background: linear-gradient(135deg, #ffffff 0%, #D4AF37 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
          Daily Market Report
        </h1>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid rgba(212, 175, 55, 0.3);">
          <p style="margin: 0; font-size: 20px; color: #D4AF37; font-weight: 700; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            ${formattedDate}
          </p>
          <p style="margin: 10px 0 0 0; font-size: 14px; color: #94a3b8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            Pre-Market Analysis • Generated ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
          </p>
        </div>
      </div>
      <div style="position: absolute; top: -100px; right: -100px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0) 70%); border-radius: 50%;"></div>
      <div style="position: absolute; bottom: -50px; left: -50px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(102,126,234,0.15) 0%, rgba(102,126,234,0) 70%); border-radius: 50%;"></div>
    </div>
    
    <div style="background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); padding: 35px 40px; border-bottom: 2px solid #e2e8f0;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
        <span style="font-size: 24px;">📊</span>
        <h3 style="margin: 0; font-size: 18px; color: #1e293b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">Market Indices</h3>
      </div>
      <div style="display: flex; gap: 18px; flex-wrap: wrap;">
        ${summaryCards}
      </div>
    </div>
    
    <div style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); padding: 35px 40px; border-bottom: 2px solid #e2e8f0;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
        <span style="font-size: 24px;">🔥</span>
        <h3 style="margin: 0; font-size: 18px; color: #1e293b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">Top Movers</h3>
      </div>
      ${moversCards}
    </div>
    
    <div style="padding: 50px 40px; background: #f8fafc;">
      ${htmlContent}
    </div>
    
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 50px 40px;">
      <div style="max-width: 700px; margin: 0 auto; text-align: center;">
        <div style="margin-bottom: 24px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%); color: #1a1a1a; padding: 10px 28px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1.5px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; box-shadow: 0 4px 12px rgba(212,175,55,0.3);">
            ⚡ POWERED BY AI
          </div>
        </div>
        <p style="margin: 0 0 14px 0; font-size: 14px; color: #94a3b8; line-height: 1.7; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          This report is automatically generated using real-time market data from <strong style="color: #D4AF37;">Finnhub</strong><br>and advanced AI analysis powered by <strong style="color: #D4AF37;">Anthropic Claude</strong>.
        </p>
        <div style="margin-top: 32px; padding-top: 32px; border-top: 1px solid rgba(148,163,184,0.2);">
          <p style="margin: 0; font-size: 12px; color: #64748b; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6;">
            <strong style="color: #94a3b8;">IMPORTANT DISCLAIMER:</strong> This report is for informational purposes only and does not constitute investment advice, financial advice, trading advice, or any other sort of advice. Past performance is not indicative of future results. You should not treat any of the report's content as such. Do your own research and consult with a licensed financial advisor before making any investment decisions.
          </p>
        </div>
      </div>
    </div>
    
  </div>
</body>
</html>
  `;
}

async function sendEmail(htmlContent) {
  console.log('Sending email...');
  
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: CONFIG.emailUser,
      pass: CONFIG.emailPass
    }
  });
  
  const mailOptions = {
    from: `Market Report <${CONFIG.emailUser}>`,
    to: CONFIG.recipientEmail,
    subject: `📊 Daily Market Report - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    html: htmlContent
  };
  
  try {
    const info = await transport.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('=== Daily Market Report Generator ===');
    console.log('Starting report generation...\n');
    
    if (!CONFIG.anthropicApiKey || !CONFIG.finnhubApiKey || !CONFIG.emailUser || !CONFIG.emailPass || !CONFIG.recipientEmail) {
      throw new Error('Missing required environment variables. Please check your configuration.');
    }
    
    const marketData = await collectMarketData();
    console.log(`✓ Collected data for ${marketData.marketData.length} symbols`);
    console.log(`✓ Collected ${marketData.news.length} news articles`);
    console.log(`✓ Collected ${marketData.earnings.length} earnings reports\n`);
    
    const analysis = await generateAnalysis(marketData);
    console.log('✓ Generated AI analysis\n');
    
    const htmlContent = formatEmailHTML(analysis, marketData);
    console.log('✓ Formatted email content\n');
    
    await sendEmail(htmlContent);
    console.log('✓ Email sent successfully\n');
    
    console.log('=== Report generation complete! ===');
    
  } catch (error) {
    console.error('\n❌ Error generating report:', error.message);
    process.exit(1);
  }
}

main();
