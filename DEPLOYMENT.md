# Deploying Scout Website with Dashboard to Vercel

## Prerequisites

- GitHub account
- Vercel account (free tier works)
- Supabase service role key

## Step 1: Push to GitHub

If you haven't already, initialize a git repository and push to GitHub:

```bash
cd /Users/samzamor/src/scout-website
git init
git add .
git commit -m "Add Discovery Feed Dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/scout-website.git
git push -u origin main
```

## Step 2: Connect to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your `scout-website` repository
4. Configure project settings:
   - **Framework Preset**: Other (it's a static site)
   - **Build Command**: Leave empty
   - **Output Directory**: Leave empty (root)
   - **Install Command**: Leave empty

## Step 3: Add Environment Variables

In the Vercel project settings:

1. Go to **Settings** → **Environment Variables**
2. Add the following variables:

   **Variable 1:**
   - Key: `NEXT_PUBLIC_SUPABASE_URL`
   - Value: `https://cmnrchhvgulkedtpxfci.supabase.co`
   - Environment: Production, Preview, Development

   **Variable 2:**
   - Key: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: Your Supabase service role key (from Supabase Project Settings > API)
   - Environment: Production, Preview, Development

## Step 4: Update Dashboard JavaScript

Before deploying, you need to update `js/dashboard.js` to use environment variables properly.

Since this is a static site, you have two options:

### Option A: Keep it simple (Current Implementation)

Edit `js/dashboard.js` and replace `YOUR_SERVICE_ROLE_KEY_HERE` with your actual service role key.

**⚠️ Security Note**: This exposes the key in client-side code. Only use this for:
- Internal dashboards
- Behind authentication
- Trusted team access only

### Option B: Add a backend proxy (Recommended for Production)

Create a Vercel serverless function to proxy database requests:

1. Create `api/dashboard-data.js`:

```javascript
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Handle different data requests
  const { type } = req.query;

  try {
    let data;
    switch (type) {
      case 'overview':
        // Fetch overview stats
        break;
      case 'sources':
        // Fetch source health
        break;
      // ... other cases
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

2. Update `js/dashboard.js` to call `/api/dashboard-data` instead of direct Supabase queries.

## Step 5: Deploy

1. Click **Deploy** in Vercel
2. Wait for the build to complete
3. Visit your deployed site at `https://your-project.vercel.app`
4. Access the dashboard at `https://your-project.vercel.app/pages/dashboard.html`

## Step 6: Add Authentication (Optional but Recommended)

To protect your dashboard, add Vercel password protection:

1. Go to **Settings** → **Deployment Protection**
2. Enable **Password Protection**
3. Set a password
4. Save changes

Or implement proper authentication:
- Use Vercel's built-in authentication
- Add a simple login page
- Use middleware to protect `/pages/dashboard.html`

## Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your custom domain (e.g., `scout-website.com`)
3. Update DNS records as instructed
4. Dashboard will be accessible at `https://scout-website.com/pages/dashboard.html`

## Updating the Dashboard

To update the dashboard after making changes:

```bash
git add .
git commit -m "Update dashboard"
git push
```

Vercel will automatically rebuild and redeploy.

## Troubleshooting

**Dashboard not loading data:**
- Check that environment variables are set correctly in Vercel
- Verify the Supabase service role key is valid
- Check Vercel function logs for errors

**Build fails:**
- Ensure all files are committed to git
- Check that there are no syntax errors in HTML/CSS/JS
- Review Vercel build logs for specific errors

**Styles not loading:**
- Verify all CSS files are in the correct paths
- Check that CDN resources (Lucide, Supabase) are accessible
- Clear browser cache and hard refresh

## Security Best Practices

1. **Never commit** `.env` or `.env.local` files to git
2. **Use environment variables** for all sensitive data
3. **Enable password protection** for the dashboard route
4. **Consider** moving to a backend API for production
5. **Rotate keys** regularly if they're exposed
6. **Monitor** Supabase usage for unusual activity

## Support

For deployment issues:
- Check [Vercel Documentation](https://vercel.com/docs)
- Review [Supabase Documentation](https://supabase.com/docs)
- Contact your development team

