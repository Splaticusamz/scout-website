# Discovery Feed Dashboard

Real-time monitoring dashboard for the Scout AI curation system.

## Features

- **Overview Stats**: Total cards, active sources, pending processing, missing images, likes/dislikes, quality scores
- **Processing Pipeline**: Visual breakdown of raw content processing status with progress tracking
- **Source Health**: Detailed table showing scraping status, errors, and performance for each source
- **Recent Activity**: Cards created in last 24 hours, 7 days, and most recent timestamp
- **Auto-Refresh**: Automatically updates every 30 seconds

## Setup

### 1. Configure Supabase Credentials

The dashboard needs your Supabase service role key to query the database.

**Option A: Direct Configuration (Quick Start)**

Edit `js/dashboard.js` and replace the placeholder:

```javascript
const SUPABASE_SERVICE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE';
```

With your actual service role key from Supabase Project Settings > API.

**Option B: Environment Variables (Recommended for Production)**

For production deployment, you should:
1. Move the dashboard logic to a backend API endpoint
2. Use environment variables to store the service role key
3. Never expose the service role key in client-side code

### 2. Open the Dashboard

Simply open `pages/dashboard.html` in your browser:

```bash
# If using a local server:
python3 -m http.server 8000
# Then visit: http://localhost:8000/pages/dashboard.html

# Or just open the file directly:
open pages/dashboard.html
```

### 3. Deploy to Vercel (Optional)

To deploy the dashboard alongside the marketing site:

1. Push your changes to GitHub
2. Connect the repository to Vercel
3. Add environment variable in Vercel dashboard:
   - Key: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: Your service role key

**Note**: For production, you should create a backend API endpoint to handle database queries instead of exposing the service role key in client-side JavaScript.

## Security Warning

⚠️ **IMPORTANT**: The service role key has full admin access to your Supabase database. 

**Current Implementation**: The key is embedded in client-side JavaScript, which is fine for:
- Local development
- Internal dashboards behind authentication
- Trusted team access only

**For Production**: You should:
1. Create a Next.js API route or serverless function
2. Move all database queries to the backend
3. Use environment variables for the service role key
4. Add authentication to protect the dashboard route

## Files

- `pages/dashboard.html` - Main dashboard page
- `css/dashboard.css` - Dashboard-specific styles
- `js/dashboard.js` - Data fetching and UI logic
- `.env.example` - Example environment configuration
- `.gitignore` - Prevents committing sensitive files

## Database Tables Used

- `discovery_cards` - Curated cards ready for users
- `raw_scraped_content` - Raw content awaiting AI processing
- `discovery_sources` - RSS feed sources configuration
- `discovery_card_sources` - Additional research links
- `user_card_feedback` - User likes/dislikes (if enabled)

## Customization

### Adjust Auto-Refresh Interval

In `js/dashboard.js`, change the refresh countdown:

```javascript
let refreshCountdown = 30; // Change to desired seconds
```

### Modify Stat Cards

Edit `pages/dashboard.html` to add/remove stat cards in the `.stats-grid` section.

### Update Styling

Modify `css/dashboard.css` to match your brand colors and design preferences.

## Troubleshooting

**Dashboard shows "Loading..." forever**
- Check browser console for errors
- Verify your Supabase service role key is correct
- Ensure your Supabase project is accessible

**"Failed to load dashboard data"**
- Check that all required database tables exist
- Verify your Supabase URL is correct
- Check browser network tab for failed requests

**Styles look broken**
- Ensure `css/dashboard.css` is loaded
- Check that Lucide icons CDN is accessible
- Verify Tailwind/custom CSS isn't conflicting

## Support

For issues or questions, check the Supabase logs or contact your development team.

