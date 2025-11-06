# Daily Market Report Generator

Automated daily market analysis report that summarizes market data and news from close to open, delivered to your email at 7 AM EST.

## Features

- **Market Data Analysis**: Fetches data from Finnhub API
- **AI-Powered Summary**: Uses Claude (Anthropic) to generate analyst-level insights
- **Professional Email Reports**: Clean, sectioned format optimized for traders
- **Automated Delivery**: GitHub Actions workflow runs daily at 7 AM EST
- **Key Sections**:
  - Market Overview & Performance
  - Overnight News Summary
  - Sector Analysis
  - Pre-Market Movers
  - Key Economic Events
  - Risk Factors & Opportunities

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd daily-market-report
npm install
```

### 2. Get API Keys

#### Finnhub API
1. Sign up at [finnhub.io](https://finnhub.io/)
2. Get your free API key from the dashboard

#### Anthropic API
1. Sign up at [console.anthropic.com](https://console.anthropic.com/)
2. Create an API key

#### Email (Gmail)
1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Use this app password (not your regular Gmail password)

### 3. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `FINNHUB_API_KEY`: Your Finnhub API key
- `EMAIL_USER`: Your Gmail address (e.g., yourname@gmail.com)
- `EMAIL_PASS`: Your Gmail App Password
- `RECIPIENT_EMAIL`: Email address to receive reports

### 4. Customize Settings (Optional)

Edit `generate.js` to customize:
- Tracked stocks and indices
- Sectors to monitor
- Report sections
- Analysis depth

## Local Testing

Test the report generation locally:

```bash
# Set environment variables
export ANTHROPIC_API_KEY="your_key"
export FINNHUB_API_KEY="your_key"
export EMAIL_USER="your_email@gmail.com"
export EMAIL_PASS="your_app_password"
export RECIPIENT_EMAIL="recipient@email.com"

# Run the generator
node generate.js
```

## How It Works

1. **Data Collection** (6:30-6:45 AM EST)
   - Fetches overnight market data from Finnhub
   - Collects news articles from previous market close to current time
   - Gathers pre-market futures and index data

2. **AI Analysis** (6:45-6:55 AM EST)
   - Sends data to Claude for analysis
   - Generates professional market commentary
   - Identifies key trends and trading opportunities

3. **Email Delivery** (7:00 AM EST)
   - Formats report with professional styling
   - Sends via nodemailer to configured email
   - Includes all sections with gold headers

## Workflow Schedule

The GitHub Action runs Monday-Friday at 7:00 AM EST (11:00 UTC). It automatically:
- Checks out the code
- Installs dependencies
- Runs the report generator
- Sends the email

## File Structure

```
daily-market-report/
├── .github/
│   └── workflows/
│       └── daily-report.yml    # GitHub Actions workflow
├── generate.js                  # Main report generator
├── package.json                 # Dependencies
├── .gitignore                   # Git ignore file
└── README.md                    # This file
```

## Troubleshooting

### Email Not Sending
- Verify Gmail App Password is correct
- Check that 2FA is enabled on your Google account
- Ensure EMAIL_USER and EMAIL_PASS secrets are set correctly

### API Rate Limits
- Finnhub free tier: 60 calls/minute
- Consider upgrading if you hit limits
- Anthropic API: Monitor your usage at console.anthropic.com

### Workflow Not Running
- Verify all GitHub secrets are set
- Check Actions tab for error messages
- Ensure workflow file is in `.github/workflows/`

## Customization Ideas

- Add more data sources (Alpha Vantage, Polygon.io)
- Include crypto or forex analysis
- Add technical indicators (RSI, MACD)
- Generate PDF attachments
- Add SMS notifications via Twilio
- Create a web dashboard

## Cost Estimates

- Finnhub API: Free tier (60 calls/min)
- Anthropic API: ~$0.01-0.05 per report (Claude Sonnet)
- GitHub Actions: Free for public repos
- Email: Free (Gmail)

**Estimated monthly cost: $0.30-$1.50**

## License

MIT

## Support

For issues or questions, please open a GitHub issue.
