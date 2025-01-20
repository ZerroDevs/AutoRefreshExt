let refreshTimers = {};
let refreshCounts = {};
let activePages = {};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	switch (message.action) {
		case 'startRefresh':
			startRefreshTimer(message.tabId, message.interval, message.limit, message.notify);
			break;
		case 'stopRefresh':
			stopRefreshTimer(message.tabId);
			break;
		case 'pauseRefresh':
			pauseRefreshTimer(message.tabId);
			break;
		case 'resumeRefresh':
			resumeRefreshTimer(message.tabId);
			break;
		case 'getRefreshCount':
			sendResponse({ count: refreshCounts[message.tabId] || 0 });
			break;
	}
});

function startRefreshTimer(tabId, interval, limit = 0, notify = false) {
	stopRefreshTimer(tabId);
	refreshCounts[tabId] = 0;
	
	activePages[tabId] = {
		interval,
		limit,
		notify,
		isPaused: false,
		lastRefresh: Date.now()
	};

	refreshTimers[tabId] = setInterval(() => {
		if (activePages[tabId].isPaused) return;

		chrome.tabs.get(tabId, (tab) => {
			if (chrome.runtime.lastError) {
				stopRefreshTimer(tabId);
				updatePageStatus(tabId, false);
				return;
			}

			// Check refresh limit
			if (activePages[tabId].limit > 0 && refreshCounts[tabId] >= activePages[tabId].limit) {
				stopRefreshTimer(tabId);
				if (activePages[tabId].notify) {
					showNotification(tab.title, 'Refresh limit reached');
				}
				return;
			}

			// Refresh the tab
			chrome.tabs.reload(tabId);
			refreshCounts[tabId] = (refreshCounts[tabId] || 0) + 1;
			activePages[tabId].lastRefresh = Date.now();

			if (activePages[tabId].notify) {
				showNotification(tab.title, `Page refreshed (${refreshCounts[tabId]}/${activePages[tabId].limit || '∞'})`);
			}

			// Update status
			updatePageStatus(tabId, true);
		});
	}, interval);
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
		clearInterval(refreshTimers[tabId]);
		delete refreshTimers[tabId];
		delete activePages[tabId];
		delete refreshCounts[tabId];
		updatePageStatus(tabId, false);
	}
}

function showNotification(title, message) {
	chrome.notifications.create({
		type: 'basic',
		iconUrl: 'icon48.png',
		title: 'AutoRefresh',
		message: `${title}: ${message}`
	});
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
							page.refreshLimit,
							page.notify
						);
					} else {
						updatePageStatus(parseInt(tabId), false);
					}
				});
			});
		}
	});
});