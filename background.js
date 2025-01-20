


let refreshTimers = {};
let refreshCounts = {};
let activePages = {};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log('Received message:', message); // Debug log
	switch (message.action) {
		case 'startRefresh':
			startRefreshTimer(message.tabId, message.interval, message.limit);
			sendResponse({ success: true, message: 'Refresh timer started' });
			break;
		case 'stopRefresh':
			stopRefreshTimer(message.tabId);
			sendResponse({ success: true, message: 'Refresh timer stopped' });
			break;
		case 'pauseRefresh':
			pauseRefreshTimer(message.tabId);
			sendResponse({ success: true, message: 'Refresh timer paused' });
			break;
		case 'resumeRefresh':
			resumeRefreshTimer(message.tabId);
			sendResponse({ success: true, message: 'Refresh timer resumed' });
			break;
		case 'getRefreshCount':
			sendResponse({ count: refreshCounts[message.tabId] || 0 });
			break;
	}
	return true; // Keep the message channel open for sendResponse
});

function startRefreshTimer(tabId, interval, limit = 0) {
	console.log('Starting refresh timer:', { tabId, interval, limit });
	stopRefreshTimer(tabId);
	refreshCounts[tabId] = 0;
	
	activePages[tabId] = {
		interval,
		limit,
		isPaused: false,
		lastRefresh: Date.now()
	};


	function refresh() {
		if (!activePages[tabId] || activePages[tabId].isPaused) return;

		chrome.tabs.get(tabId, (tab) => {
			if (chrome.runtime.lastError) {
				stopRefreshTimer(tabId);
				updatePageStatus(tabId, false);
				return;
			}

			// Check refresh limit
			if (activePages[tabId].limit > 0 && refreshCounts[tabId] >= activePages[tabId].limit) {
				stopRefreshTimer(tabId);


				return;
			}

			// Refresh the tab
			chrome.tabs.reload(tabId);
			refreshCounts[tabId] = (refreshCounts[tabId] || 0) + 1;
			activePages[tabId].lastRefresh = Date.now();




			updatePageStatus(tabId, true);
		});
	}

	// Use recursive setTimeout for more accurate timing
	function scheduleNextRefresh() {
		refreshTimers[tabId] = setTimeout(() => {
			refresh();
			if (activePages[tabId] && !activePages[tabId].isPaused) {
				scheduleNextRefresh();
			}
		}, interval);
	}

	scheduleNextRefresh();
}

// Add helper function for time formatting
function formatTime(ms) {
	if (ms < 60000) {
		return `${Math.round(ms/1000)} seconds`;
	} else if (ms < 3600000) {
		return `${Math.round(ms/60000)} minutes`;
	} else {
		return `${Math.round(ms/3600000)} hours`;
	}
}

function pauseRefreshTimer(tabId) {
	if (activePages[tabId]) {
		activePages[tabId].isPaused = true;
		updatePageStatus(tabId, true);
	}
}

function resumeRefreshTimer(tabId) {
	if (activePages[tabId]) {
		activePages[tabId].isPaused = false;
		activePages[tabId].lastRefresh = Date.now();
		updatePageStatus(tabId, true);
	}
}

function stopRefreshTimer(tabId) {
	if (refreshTimers[tabId]) {
		clearTimeout(refreshTimers[tabId]);
		delete refreshTimers[tabId];
		delete activePages[tabId];
		delete refreshCounts[tabId];
		updatePageStatus(tabId, false);
	}
}





function updatePageStatus(tabId, isActive) {
	chrome.storage.local.get(['pages'], (result) => {
		if (result.pages && result.pages[tabId]) {
			result.pages[tabId].isActive = isActive;
			result.pages[tabId].isPaused = activePages[tabId]?.isPaused || false;
			result.pages[tabId].refreshCount = refreshCounts[tabId] || 0;
			chrome.storage.local.set({pages: result.pages});
		}
	});
}

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
	stopRefreshTimer(tabId);
	// Remove from storage
	chrome.storage.local.get(['pages'], (result) => {
		if (result.pages && result.pages[tabId]) {
			delete result.pages[tabId];
			chrome.storage.local.set({pages: result.pages});
		}
	});
});

// Handle browser startup
chrome.runtime.onStartup.addListener(() => {
	chrome.storage.local.get(['pages'], (result) => {
		if (result.pages) {
			Object.entries(result.pages).forEach(([tabId, page]) => {
				chrome.tabs.get(parseInt(tabId), (tab) => {
					if (!chrome.runtime.lastError) {
						startRefreshTimer(
							parseInt(tabId), 
							page.interval,
							page.refreshLimit

						);
					} else {
						updatePageStatus(parseInt(tabId), false);
					}
				});
			});
		}
	});
});