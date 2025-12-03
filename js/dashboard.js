// Discovery Feed Dashboard
// NOTE: This uses the Supabase service role key which should NEVER be exposed in production.
// For production, move this to a backend API endpoint.

const SUPABASE_URL = 'https://cmnrchhvgulkedtpxfci.supabase.co';
// TODO: Replace with your actual service role key or use environment variables
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtbnJjaGh2Z3Vsa2VkdHB4ZmNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE4OTI5NCwiZXhwIjoyMDc5NzY1Mjk0fQ.YjScFGMUmV0fukUBCTQF0BzKCVFOr2n_7XMdYXzgbks';

// Initialize Supabase client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Auto-refresh timer
let refreshCountdown = 30;
let refreshInterval;

// Initialize dashboard
async function initDashboard() {
  await loadAllData();
  startAutoRefresh();
  updateLastUpdatedTime();
}

// Load all dashboard data
async function loadAllData() {
  try {
    await Promise.all([
      loadOverviewStats(),
      loadProcessingPipeline(),
      loadSourceHealth(),
      loadRecentActivity()
    ]);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showError('Failed to load dashboard data. Check console for details.');
  }
}

// Load overview statistics
async function loadOverviewStats() {
  try {
    // Total cards
    const { count: totalCards } = await supabaseClient
      .from('discovery_cards')
      .select('*', { count: 'exact', head: true });
    
    // Active sources
    const { count: activeSources } = await supabaseClient
      .from('discovery_sources')
      .select('*', { count: 'exact', head: true })
      .eq('enabled', true);
    
    // Pending processing
    const { count: pendingProcessing } = await supabaseClient
      .from('raw_scraped_content')
      .select('*', { count: 'exact', head: true })
      .eq('processed', false);
    
    // Missing images
    const { count: missingImages } = await supabaseClient
      .from('discovery_cards')
      .select('*', { count: 'exact', head: true })
      .is('image_url', null);
    
    // Quality metrics
    const { data: qualityData } = await supabaseClient
      .from('discovery_cards')
      .select('global_like_count, global_dislike_count, global_quality_score');
    
    const totalLikes = qualityData?.reduce((sum, card) => sum + (card.global_like_count || 0), 0) || 0;
    const totalDislikes = qualityData?.reduce((sum, card) => sum + (card.global_dislike_count || 0), 0) || 0;
    const avgQuality = qualityData?.length > 0
      ? (qualityData.reduce((sum, card) => sum + (card.global_quality_score || 50), 0) / qualityData.length).toFixed(1)
      : '50.0';
    
    // Cards with links
    const { data: linksData } = await supabaseClient
      .from('discovery_card_sources')
      .select('discovery_card_id');
    
    const cardsWithLinks = new Set(linksData?.map(l => l.discovery_card_id) || []).size;
    
    // Update UI
    document.getElementById('stat-total-cards').textContent = formatNumber(totalCards || 0);
    document.getElementById('stat-active-sources').textContent = formatNumber(activeSources || 0);
    document.getElementById('stat-pending-processing').textContent = formatNumber(pendingProcessing || 0);
    document.getElementById('stat-missing-images').textContent = formatNumber(missingImages || 0);
    document.getElementById('stat-total-likes').textContent = formatNumber(totalLikes);
    document.getElementById('stat-total-dislikes').textContent = formatNumber(totalDislikes);
    document.getElementById('stat-avg-quality').textContent = avgQuality;
    document.getElementById('stat-cards-with-links').textContent = formatNumber(cardsWithLinks);
  } catch (error) {
    console.error('Error loading overview stats:', error);
  }
}

// Load processing pipeline status
async function loadProcessingPipeline() {
  try {
    const { data: rawItems } = await supabaseClient
      .from('raw_scraped_content')
      .select('processed, processing_result');
    
    const unprocessed = rawItems?.filter(item => !item.processed).length || 0;
    const created = rawItems?.filter(item => item.processed && item.processing_result === 'created_card').length || 0;
    const rejected = rawItems?.filter(item => item.processed && item.processing_result === 'rejected').length || 0;
    const errors = rawItems?.filter(item => item.processed && item.processing_result === 'error').length || 0;
    
    const total = rawItems?.length || 1;
    const processed = created + rejected + errors;
    const progressPercent = ((processed / total) * 100).toFixed(1);
    
    // Update UI
    document.getElementById('pipeline-unprocessed').textContent = formatNumber(unprocessed);
    document.getElementById('pipeline-created').textContent = formatNumber(created);
    document.getElementById('pipeline-rejected').textContent = formatNumber(rejected);
    document.getElementById('pipeline-errors').textContent = formatNumber(errors);
    document.getElementById('pipeline-progress-fill').style.width = `${progressPercent}%`;
    document.getElementById('pipeline-progress-text').textContent = `${progressPercent}% processed`;
  } catch (error) {
    console.error('Error loading processing pipeline:', error);
  }
}

// Load source health
async function loadSourceHealth() {
  try {
    const { data: sources } = await supabaseClient
      .from('discovery_sources')
      .select('*')
      .order('last_scraped_at', { ascending: false, nullsFirst: false });
    
    if (!sources || sources.length === 0) {
      document.getElementById('sources-table-body').innerHTML = 
        '<tr><td colspan="7" class="loading-cell">No sources found</td></tr>';
      return;
    }
    
    // Get card counts for each source
    const { data: cardCounts } = await supabaseClient
      .from('discovery_cards')
      .select('source_name');
    
    const countsBySource = {};
    cardCounts?.forEach(card => {
      countsBySource[card.source_name] = (countsBySource[card.source_name] || 0) + 1;
    });
    
    // Build table rows
    const tbody = document.getElementById('sources-table-body');
    tbody.innerHTML = sources.map(source => {
      const now = new Date();
      const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at) : null;
      const hoursSince = lastScraped ? (now - lastScraped) / (1000 * 60 * 60) : null;
      const nextScrape = lastScraped ? new Date(lastScraped.getTime() + source.scrape_interval_hours * 60 * 60 * 1000) : null;
      
      // Determine status
      let statusClass, statusText;
      if (!source.enabled) {
        statusClass = 'disabled';
        statusText = 'Disabled';
      } else if (source.last_error) {
        statusClass = 'error';
        statusText = 'Error';
      } else if (hoursSince === null) {
        statusClass = 'warning';
        statusText = 'Never';
      } else if (hoursSince < 1) {
        statusClass = 'healthy';
        statusText = 'Healthy';
      } else if (hoursSince > source.scrape_interval_hours) {
        statusClass = 'warning';
        statusText = 'Overdue';
      } else {
        statusClass = 'healthy';
        statusText = 'Healthy';
      }
      
      return `
        <tr>
          <td>
            <div class="source-name">${escapeHtml(source.name)}</div>
            <div class="source-display-name">${escapeHtml(source.display_name)}</div>
          </td>
          <td>
            <span class="status-badge ${statusClass}">${statusText}</span>
          </td>
          <td>
            <span class="time-text">${lastScraped ? formatRelativeTime(lastScraped) : 'Never'}</span>
          </td>
          <td>
            <span class="time-text">${nextScrape && source.enabled ? formatRelativeTime(nextScrape) : '—'}</span>
          </td>
          <td>
            <span class="time-text">${formatNumber(countsBySource[source.name] || 0)}</span>
          </td>
          <td>
            <span class="quality-badge">
              <i data-lucide="star"></i>
              ${source.source_quality_tier || 5}/10
            </span>
          </td>
          <td>
            ${source.last_error ? `<span class="error-text" title="${escapeHtml(source.last_error)}">${escapeHtml(source.last_error)}</span>` : '—'}
          </td>
        </tr>
      `;
    }).join('');
    
    // Reinitialize Lucide icons for the table
    lucide.createIcons();
  } catch (error) {
    console.error('Error loading source health:', error);
  }
}

// Load recent activity
async function loadRecentActivity() {
  try {
    const { data: cards } = await supabaseClient
      .from('discovery_cards')
      .select('created_at')
      .order('created_at', { ascending: false });
    
    if (!cards || cards.length === 0) {
      document.getElementById('activity-24h').textContent = '0';
      document.getElementById('activity-7d').textContent = '0';
      document.getElementById('activity-recent').textContent = 'Never';
      return;
    }
    
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    
    const cards24h = cards.filter(card => new Date(card.created_at) > oneDayAgo).length;
    const cards7d = cards.filter(card => new Date(card.created_at) > sevenDaysAgo).length;
    const mostRecent = cards[0] ? new Date(cards[0].created_at) : null;
    
    document.getElementById('activity-24h').textContent = formatNumber(cards24h);
    document.getElementById('activity-7d').textContent = formatNumber(cards7d);
    document.getElementById('activity-recent').textContent = mostRecent ? formatRelativeTime(mostRecent) : 'Never';
  } catch (error) {
    console.error('Error loading recent activity:', error);
  }
}

// Auto-refresh functionality
function startAutoRefresh() {
  // Update countdown every second
  refreshInterval = setInterval(() => {
    refreshCountdown--;
    document.getElementById('refresh-countdown').textContent = refreshCountdown;
    
    if (refreshCountdown <= 0) {
      refreshCountdown = 30;
      loadAllData();
      updateLastUpdatedTime();
    }
  }, 1000);
}

function updateLastUpdatedTime() {
  const now = new Date();
  document.getElementById('last-updated-time').textContent = now.toLocaleTimeString();
}

// Utility functions
function formatNumber(num) {
  return num.toLocaleString();
}

function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  console.error(message);
  // Could add a toast notification here
}

// Get dashboard summary object
function getDashboardSummary() {
  return {
    exportedAt: new Date().toISOString(),
    overview: {
      totalCards: document.getElementById('stat-total-cards')?.textContent,
      activeSources: document.getElementById('stat-active-sources')?.textContent,
      pendingProcessing: document.getElementById('stat-pending-processing')?.textContent,
      missingImages: document.getElementById('stat-missing-images')?.textContent,
      totalLikes: document.getElementById('stat-total-likes')?.textContent,
      totalDislikes: document.getElementById('stat-total-dislikes')?.textContent,
      avgQuality: document.getElementById('stat-avg-quality')?.textContent,
      cardsWithLinks: document.getElementById('stat-cards-with-links')?.textContent
    },
    pipeline: {
      unprocessed: document.getElementById('pipeline-unprocessed')?.textContent,
      created: document.getElementById('pipeline-created')?.textContent,
      rejected: document.getElementById('pipeline-rejected')?.textContent,
      errors: document.getElementById('pipeline-errors')?.textContent,
      progressText: document.getElementById('pipeline-progress-text')?.textContent
    },
    activity: {
      last24Hours: document.getElementById('activity-24h')?.textContent,
      last7Days: document.getElementById('activity-7d')?.textContent,
      mostRecent: document.getElementById('activity-recent')?.textContent
    }
  };
}

// Copy dashboard summary only
async function copyDashboardSummary() {
  try {
    const summary = getDashboardSummary();
    const jsonString = JSON.stringify(summary, null, 2);
    await navigator.clipboard.writeText(jsonString);

    // Visual feedback
    showCopyFeedback(event.target.closest('.copy-data-btn'));
  } catch (error) {
    console.error('Error copying dashboard summary:', error);
    alert('Failed to copy summary. Check console for details.');
  }
}

// Copy all dashboard data including summary
async function copyAllDashboardData() {
  try {
    // Fetch all relevant data
    const [
      { data: cards },
      { data: sources },
      { data: rawContent },
      { data: cardSources }
    ] = await Promise.all([
      supabaseClient.from('discovery_cards').select('*').order('created_at', { ascending: false }).limit(50),
      supabaseClient.from('discovery_sources').select('*'),
      supabaseClient.from('raw_scraped_content').select('*').order('scraped_at', { ascending: false }).limit(50),
      supabaseClient.from('discovery_card_sources').select('*').limit(100)
    ]);

    const data = {
      summary: getDashboardSummary(),
      fullData: {
        sources: sources || [],
        recentCards: cards || [],
        recentRawContent: rawContent || [],
        cardSourceLinks: cardSources || []
      }
    };

    const jsonString = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(jsonString);

    // Visual feedback
    showCopyFeedback(event.target.closest('.copy-data-btn'));
  } catch (error) {
    console.error('Error copying all dashboard data:', error);
    alert('Failed to copy data. Check console for details.');
  }
}

// Show copy feedback on button
function showCopyFeedback(btn) {
  if (!btn) return;
  
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="check"></i><span>Copied!</span>';
  btn.classList.add('copied');
  lucide.createIcons();
  
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.classList.remove('copied');
    lucide.createIcons();
  }, 2000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initDashboard);

