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
      loadEdgeFunctions(),
      loadSystemTimeline(),
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

// Load edge functions status
async function loadEdgeFunctions() {
  try {
    const edgeFunctions = [
      { name: 'scraper-job', lastRunField: 'last_scraped_at', table: 'discovery_sources' },
      { name: 'ai-processor', lastRunField: 'updated_at', table: 'raw_scraped_content', filter: { processed: true } },
      { name: 'ai-prompt-evolver', lastRunField: 'updated_at', table: 'discovery_cards' },
      { name: 'discovery-feed', lastRunField: 'created_at', table: 'discovery_cards' },
      { name: 'feedback-processor', lastRunField: 'updated_at', table: 'discovery_cards' },
      { name: 'summary-updater', lastRunField: 'updated_at', table: 'discovery_cards' }
    ];

    for (const func of edgeFunctions) {
      try {
        let query = supabaseClient
          .from(func.table)
          .select(func.lastRunField)
          .order(func.lastRunField, { ascending: false, nullsFirst: false })
          .limit(1);

        if (func.filter) {
          Object.entries(func.filter).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }

        const { data } = await query;
        const lastRun = data?.[0]?.[func.lastRunField] ? new Date(data[0][func.lastRunField]) : null;
        
        const element = document.getElementById(`lastrun-${func.name}`);
        if (element) {
          element.textContent = lastRun ? formatRelativeTime(lastRun) : 'Never';
        }
      } catch (error) {
        console.error(`Error loading ${func.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Error loading edge functions:', error);
  }
}

// Activity console
function addConsoleLog(message, type = 'info') {
  const console = document.getElementById('activity-console-logs');
  if (!console) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `console-log ${type}`;
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'console-time';
  timeSpan.textContent = timestamp;
  
  const messageSpan = document.createElement('span');
  messageSpan.className = 'console-message';
  messageSpan.textContent = message;
  
  logEntry.appendChild(timeSpan);
  logEntry.appendChild(messageSpan);
  console.appendChild(logEntry);
  
  // Auto-scroll to bottom
  console.scrollTop = console.scrollHeight;
  
  // Keep only last 50 logs
  while (console.children.length > 50) {
    console.removeChild(console.firstChild);
  }
}

function clearConsole() {
  const console = document.getElementById('activity-console-logs');
  if (console) {
    console.innerHTML = '';
  }
}

// Monitor database changes during function execution
async function monitorDatabaseChanges(functionName, startTime) {
  const tables = {
    'scraper-job': { table: 'raw_scraped_content', field: 'scraped_at' },
    'ai-processor': { table: 'discovery_cards', field: 'created_at' }
  };

  const config = tables[functionName];
  if (!config) return;

  try {
    const { data } = await supabaseClient
      .from(config.table)
      .select('*')
      .gte(config.field, startTime.toISOString())
      .order(config.field, { ascending: false })
      .limit(10);

    if (data && data.length > 0) {
      data.forEach(item => {
        if (functionName === 'scraper-job') {
          addConsoleLog(`  • Scraped: ${item.title || 'Item'}`, 'info');
        } else if (functionName === 'ai-processor') {
          addConsoleLog(`  • Created card: ${item.title || 'Card'}`, 'success');
        }
      });
    }
  } catch (error) {
    // Silently fail monitoring
  }
}

// Trigger edge function
async function triggerEdgeFunction(functionName) {
  const btn = event.target.closest('.edge-function-trigger');
  const originalContent = btn.innerHTML;
  
  try {
    // Update button state
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader"></i><span>Running...</span>';
    btn.classList.add('running');
    lucide.createIcons();

    // Add console logs
    addConsoleLog(`→ Triggering ${functionName}...`, 'info');

    // Record start time for monitoring
    const executionStartTime = new Date();

    // Call the edge function
    const startTime = Date.now();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    // Try to parse response
    let result;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      result = { message: text };
    }
    
    // Log success with details
    addConsoleLog(`✓ ${functionName} completed in ${duration}ms`, 'success');
    
    // Log detailed results from response
    if (result.message) {
      addConsoleLog(`  ${result.message}`, 'info');
    }
    if (result.scraped !== undefined) {
      addConsoleLog(`  Scraped ${result.scraped} items`, 'info');
    }
    if (result.processed !== undefined) {
      addConsoleLog(`  Processed ${result.processed} items`, 'info');
    }
    if (result.created !== undefined) {
      addConsoleLog(`  Created ${result.created} cards`, 'success');
    }
    if (result.rejected !== undefined) {
      addConsoleLog(`  Rejected ${result.rejected} items`, 'warning');
    }
    if (result.errors !== undefined) {
      addConsoleLog(`  Errors: ${result.errors}`, 'error');
    }
    if (result.details && Array.isArray(result.details)) {
      result.details.forEach(detail => {
        addConsoleLog(`  • ${detail}`, 'info');
      });
    }
    if (result.logs && Array.isArray(result.logs)) {
      result.logs.forEach(log => {
        const logType = log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : 'info';
        addConsoleLog(`  ${log.message}`, logType);
      });
    }

    // Monitor database changes to show what was created
    await monitorDatabaseChanges(functionName, executionStartTime);

    // Success feedback
    btn.innerHTML = '<i data-lucide="check"></i><span>Success!</span>';
    btn.classList.remove('running');
    btn.classList.add('success');
    lucide.createIcons();

    // Refresh data after a short delay
    setTimeout(async () => {
      addConsoleLog('→ Refreshing dashboard data...', 'info');
      await loadAllData();
      addConsoleLog('✓ Dashboard refreshed', 'success');
      btn.innerHTML = originalContent;
      btn.classList.remove('success');
      btn.disabled = false;
      lucide.createIcons();
    }, 2000);

  } catch (error) {
    console.error(`Error triggering ${functionName}:`, error);
    
    // Log error with details
    addConsoleLog(`✗ ${functionName} failed`, 'error');
    addConsoleLog(`  ${error.message}`, 'error');
    
    // Error feedback
    btn.innerHTML = '<i data-lucide="x"></i><span>Failed</span>';
    btn.classList.remove('running');
    btn.classList.add('error');
    lucide.createIcons();

    setTimeout(() => {
      btn.innerHTML = originalContent;
      btn.classList.remove('error');
      btn.disabled = false;
      lucide.createIcons();
    }, 3000);
  }
}

// Load system timeline
async function loadSystemTimeline() {
  try {
    // Get most recent scraping timestamp from sources
    const { data: sources } = await supabaseClient
      .from('discovery_sources')
      .select('last_scraped_at')
      .order('last_scraped_at', { ascending: false, nullsFirst: false })
      .limit(1);
    
    // Get most recent raw content
    const { data: rawContent } = await supabaseClient
      .from('raw_scraped_content')
      .select('scraped_at')
      .order('scraped_at', { ascending: false })
      .limit(1);
    
    // Get most recent processed item
    const { data: processedContent } = await supabaseClient
      .from('raw_scraped_content')
      .select('processed_at')
      .eq('processed', true)
      .order('processed_at', { ascending: false, nullsFirst: false })
      .limit(1);
    
    // Get most recent card created
    const { data: cards } = await supabaseClient
      .from('discovery_cards')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
    const lastScraped = sources?.[0]?.last_scraped_at ? new Date(sources[0].last_scraped_at) : null;
    const lastRawContent = rawContent?.[0]?.scraped_at ? new Date(rawContent[0].scraped_at) : null;
    const lastProcessed = processedContent?.[0]?.processed_at ? new Date(processedContent[0].processed_at) : null;
    const lastCardCreated = cards?.[0]?.created_at ? new Date(cards[0].created_at) : null;
    
    document.getElementById('timeline-scraping').textContent = lastScraped ? formatRelativeTime(lastScraped) : 'Never';
    document.getElementById('timeline-raw-content').textContent = lastRawContent ? formatRelativeTime(lastRawContent) : 'Never';
    document.getElementById('timeline-processing').textContent = lastProcessed ? formatRelativeTime(lastProcessed) : 'Never';
    document.getElementById('timeline-card-created').textContent = lastCardCreated ? formatRelativeTime(lastCardCreated) : 'Never';
  } catch (error) {
    console.error('Error loading system timeline:', error);
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
async function copyDashboardSummary(event) {
  try {
    const summary = getDashboardSummary();
    const jsonString = JSON.stringify(summary, null, 2);
    await navigator.clipboard.writeText(jsonString);

    // Visual feedback
    showCopyFeedback(event.currentTarget);
  } catch (error) {
    console.error('Error copying dashboard summary:', error);
    alert('Failed to copy summary. Check console for details.');
  }
}

// Copy all dashboard data including summary
async function copyAllDashboardData(event) {
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
    showCopyFeedback(event.currentTarget);
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

// Toggle source health section
function toggleSourceHealth() {
  const content = document.getElementById('source-health-content');
  const icon = document.getElementById('source-health-icon');
  
  if (content.classList.contains('collapsed')) {
    content.classList.remove('collapsed');
    icon.style.transform = 'rotate(0deg)';
  } else {
    content.classList.add('collapsed');
    icon.style.transform = 'rotate(-90deg)';
  }
  
  // Reinitialize icons after DOM change
  setTimeout(() => lucide.createIcons(), 0);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initDashboard);

