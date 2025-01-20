let refreshTimers = {};
let activePages = {};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'startRefresh') {
		startRefreshTimer(message.tabId, message.interval);
	} else if (message.action === 'stopRefresh') {
		stopRefreshTimer(message.tabId);
	}
});

// Start refresh timer for a tab
function startRefreshTimer(tabId, interval) {
	// Clear existing timer if any
	stopRefreshTimer(tabId);
	
	// Create new timer
	refreshTimers[tabId] = setInterval(() => {
		chrome.tabs.get(tabId, (tab) => {
			if (chrome.runtime.lastError) {
				stopRefreshTimer(tabId);
				updatePageStatus(tabId, false);
				return;
			}
			// Refresh the tab
			chrome.tabs.reload(tabId);
			updatePageStatus(tabId, true);
		});
	}, interval);

	// Mark page as active
	updatePageStatus(tabId, true);
}

// Stop refresh timer for a tab
function stopRefreshTimer(tabId) {
	if (refreshTimers[tabId]) {
		clearInterval(refreshTimers[tabId]);
		delete refreshTimers[tabId];
		updatePageStatus(tabId, false);
	}
}

// Update page status in storage
function updatePageStatus(tabId, isActive) {
	chrome.storage.local.get(['pages'], (result) => {
		if (result.pages && result.pages[tabId]) {
			result.pages[tabId].isActive = isActive;
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
				// Check if tab still exists
				chrome.tabs.get(parseInt(tabId), (tab) => {
					if (!chrome.runtime.lastError) {
						startRefreshTimer(parseInt(tabId), page.interval);
					} else {
						updatePageStatus(parseInt(tabId), false);
					}
				});
			});
		}
	});
});

// Restore timers when extension starts
chrome.storage.local.get(['pages'], (result) => {
	if (result.pages) {
		Object.entries(result.pages).forEach(([tabId, page]) => {
			chrome.tabs.get(parseInt(tabId), (tab) => {
				if (!chrome.runtime.lastError) {
					startRefreshTimer(parseInt(tabId), page.interval);
				} else {
					updatePageStatus(parseInt(tabId), false);
				}
			});
		});
	}
});