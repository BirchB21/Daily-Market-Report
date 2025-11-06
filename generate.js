import Anthropic from '@anthropic-ai/sdk';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';

// Configuration
const CONFIG = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  finnhubApiKey: process.env.FINNHUB_API_KEY,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  recipientEmail: process.env.RECIPIENT_EMAIL,
  
  // Symbols to track
  symbols: {
    indices: ['SPY', 'QQQ', 'DIA', 'IWM'],
    majors: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META'],
    sectors: ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLRE', 'XLB', 'XLU', 'XLC']
  }
};

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: CONFIG.anthropicApiKey
});

// Fetch market data from Finnhub
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

// Fetch market news from Finnhub
async function fetchMarketNews() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const from = yesterday.toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&from=${from}&to=${to}&token=${CONFIG.finnhubApiKey}`
    ).then(res => res.json());
    
    // Get top 20 most recent news items
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

// Fetch earnings calendar
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

// Collect all market data
async function collectMarketData() {
  console.log('Collecting market data...');
  
  const allSymbols = [
    ...CONFIG.symbols.indices,
    ...CONFIG.symbols.majors,
    ...CONFIG.symbols.sectors
  ];
  
  // Fetch data with rate limiting (Finnhub free tier: 60 calls/min)
  const marketData = [];
  for (let i = 0; i < allSymbols.length; i++) {
    const data = await fetchMarketData(allSymbols[i]);
    if (data) marketData.push(data);
    
    // Rate limit: wait 1 second between calls
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

// Generate AI analysis using Claude
async function generateAnalysis(data) {
  console.log('Generating AI analysis...');
  
  const prompt = `You are an expert financial analyst. Analyze the following market data and news from the previous market close to now, and create a comprehensive pre-market report for professional traders.

MARKET DATA:
${JSON.stringify(data.marketData, null, 2)}

OVERNIGHT NEWS (Top Stories):
${JSON.stringify(data.news, null, 2)}

EARNINGS TODAY:
${JSON.stringify(data.earnings, null, 2)}

Please provide a detailed analysis structured in the following sections:

1. EXECUTIVE SUMMARY
   - Brief 2-3 sentence overview of market sentiment and key overnight developments

2. MARKET OVERVIEW
   - Analysis of major indices (SPY, QQQ, DIA, IWM) performance
   - Overall market direction and momentum
   - Key technical levels

3. OVERNIGHT NEWS ANALYSIS
   - Summarize the most important news stories
   - Explain market impact of each major story
   - Identify themes and trends

4. SECTOR ANALYSIS
   - Performance breakdown by sector
   - Leading and lagging sectors
   - Sector rotation signals

5. PRE-MARKET MOVERS
   - Biggest gainers and losers
   - Volume and volatility analysis
   - Catalysts for significant moves

6. EARNINGS HIGHLIGHTS
   - Companies reporting today
   - Expected market impact
   - Sectors to watch

7. KEY ECONOMIC EVENTS
   - Important data releases or events today
   - Expected market impact

8. RISK FACTORS
   - Potential headwinds or concerns
   - Volatility indicators
   - Key levels to watch

9. TRADING OPPORTUNITIES
   - Potential setups based on overnight action
   - Risk/reward considerations
   - Recommended watchlist

10. BOTTOM LINE
    - Clear, actionable summary
    - Market bias (bullish/bearish/neutral)
    - Key levels and catalysts for the day

Keep the analysis professional, data-driven, and actionable. Use specific numbers and percentages. Be concise but thorough.`;

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

// Format HTML email
function formatEmailHTML(analysis, data) {
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Convert markdown-style sections to HTML with better formatting
  const sections = analysis.split(/\n(?=\d+\.\s+[A-Z\s]+)/);
  
  let htmlContent = sections.map(section => {
    // Extract section number and title
    const match = section.match(/^(\d+)\.\s+([A-Z\s]+)/);
    if (match) {
      const [, number, title] = match;
      let content = section.replace(/^\d+\.\s+[A-Z\s]+\n/, '');
      
      // Process content for better formatting
      content = content
        // Convert bullet points to proper HTML
        .replace(/^-\s+(.+)$/gm, '<li style="margin-bottom: 8px;">$1</li>')
        // Wrap lists
        .replace(/(<li[^>]*>.*<\/li>\s*)+/gs, '<ul style="margin: 12px 0; padding-left: 20px;">// Format HTML email
function formatEmailHTML(analysis, data) {
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Convert markdown-style sections to HTML
  const sections = analysis.split(/\n(?=\d+\.\s+[A-Z\s]+)/);
  
  let htmlContent = sections.map(section => {
    // Extract section number and title
    const match = section.match(/^(\d+)\.\s+([A-Z\s]+)/);
    if (match) {
      const [, number, title] = match;
      const content = section.replace(/^\d+\.\s+[A-Z\s]+\n/, '');
      
      return `
        <div style="margin-bottom: 30px;">
          <h2 style="color: #D4AF37; font-size: 18px; font-weight: 600; margin-bottom: 15px; border-bottom: 2px solid #D4AF37; padding-bottom: 8px;">
            ${number}. ${title}
          </h2>
          <div style="color: #333; line-height: 1.6; white-space: pre-wrap;">
${content}
          </div>
        </div>
      `;
    }
    return `<div style="color: #333; line-height: 1.6; white-space: pre-wrap; margin-bottom: 20px;">${section}</div>`;
  }).join('');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Market Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; padding: 0;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); color: #ffffff; padding: 40px 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 1px;">
        DAILY MARKET REPORT
      </h1>
      <p style="margin: 10px 0 0 0; font-size: 16px; color: #D4AF37; font-weight: 500;">
        ${formattedDate}
      </p>
      <p style="margin: 5px 0 0 0; font-size: 14px; color: #cccccc;">
        Generated at ${new Date().toLocaleTimeString('en-US')} EST
      </p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      ${htmlContent}
      
      <!-- Footer -->
      <div style="margin-top: 50px; padding-top: 30px; border-top: 2px solid #e0e0e0; text-align: center; color: #888;">
        <p style="margin: 0; font-size: 12px;">
          This report is generated automatically using market data from Finnhub and AI analysis from Anthropic Claude.
        </p>
        <p style="margin: 10px 0 0 0; font-size: 12px;">
          <strong>Disclaimer:</strong> This report is for informational purposes only and does not constitute investment advice.
        </p>
      </div>
    </div>
    
  </div>
</body>
</html>
  `;
}</ul>')
        // Bold text with **
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color: #1a1a1a;">$1</strong>')
        // Preserve line breaks but make paragraphs
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
  
  // Market summary cards at the top
  const majorIndices = data.marketData.filter(d => CONFIG.symbols.indices.includes(d.symbol));
  const summaryCards = majorIndices.map(index => {
    const changeColor = index.changePercent >= 0 ? '#10b981' : '#ef4444';
    const changeSymbol = index.changePercent >= 0 ? '▲' : '▼';
    return `
      <div style="flex: 1; min-width: 150px; background: #f8f9fa; padding: 16px; border-radius: 8px; text-align: center; border-left: 4px solid ${changeColor};">
        <div style="font-size: 13px; color: #6c757d; font-weight: 600; margin-bottom: 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">${index.symbol}</div>
        <div style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">${index.current?.toFixed(2) || 'N/A'}</div>
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
    
    <!-- Header -->
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
    
    <!-- Market Summary Cards -->
    <div style="background: #ffffff; padding: 30px 40px; border-bottom: 1px solid #e5e7eb;">
      <h3 style="margin: 0 0 20px 0; font-size: 16px; color: #6c757d; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">Market Snapshot</h3>
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        ${summaryCards}
      </div>
    </div>
    
    <!-- Content -->
    <div style="padding: 50px 40px; background: #ffffff;">
      ${htmlContent}
    </div>
    
    <!-- Footer -->
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
}

// Send email
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

// Main execution
async function main() {
  try {
    console.log('=== Daily Market Report Generator ===');
    console.log('Starting report generation...\n');
    
    // Validate environment variables
    if (!CONFIG.anthropicApiKey || !CONFIG.finnhubApiKey || !CONFIG.emailUser || !CONFIG.emailPass || !CONFIG.recipientEmail) {
      throw new Error('Missing required environment variables. Please check your configuration.');
    }
    
    // Step 1: Collect market data
    const marketData = await collectMarketData();
    console.log(`✓ Collected data for ${marketData.marketData.length} symbols`);
    console.log(`✓ Collected ${marketData.news.length} news articles`);
    console.log(`✓ Collected ${marketData.earnings.length} earnings reports\n`);
    
    // Step 2: Generate AI analysis
    const analysis = await generateAnalysis(marketData);
    console.log('✓ Generated AI analysis\n');
    
    // Step 3: Format email
    const htmlContent = formatEmailHTML(analysis, marketData);
    console.log('✓ Formatted email content\n');
    
    // Step 4: Send email
    await sendEmail(htmlContent);
    console.log('✓ Email sent successfully\n');
    
    console.log('=== Report generation complete! ===');
    
  } catch (error) {
    console.error('\n❌ Error generating report:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
