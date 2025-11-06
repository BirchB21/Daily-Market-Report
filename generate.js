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
