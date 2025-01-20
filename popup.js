let pages = {};

// Tab switching functionality
document.addEventListener('DOMContentLoaded', () => {
	// Tab switching
	document.querySelectorAll('.tab').forEach(tab => {
		tab.addEventListener('click', () => {
			document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
			document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
			tab.classList.add('active');
			document.getElementById(tab.dataset.tab).classList.add('active');
			if (tab.dataset.tab === 'manage') {
				updatePagesList(); // Refresh list when switching to manage tab
			}
		});
	});

	// Load saved pages
	chrome.storage.local.get(['pages'], (result) => {
		pages = result.pages || {};
		updatePagesList();
	});

	// Add event listeners for preset times
	document.querySelectorAll('.timer-options button').forEach(button => {
		button.addEventListener('click', () => {
			const minutes = parseInt(button.dataset.time);
			addCurrentPage(minutes * 60 * 1000);
		});
	});

	// Add event listener for custom time
	document.getElementById('addCustom').addEventListener('click', () => {
		const time = document.getElementById('customTime').value;
		const unit = document.getElementById('timeUnit').value;
		if (!time) return;

		let milliseconds;
		switch(unit) {
			case 'seconds':
				milliseconds = time * 1000;
				break;
			case 'minutes':
				milliseconds = time * 60 * 1000;
				break;
			case 'hours':
				milliseconds = time * 60 * 60 * 1000;
				break;
		}
		addCurrentPage(milliseconds);
	});
});

// Add current page to auto-refresh list
function addCurrentPage(interval) {
	chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
		const tab = tabs[0];
		// Check if page is already added
		if (pages[tab.id]) {
			// Update existing entry instead of creating a new one
			pages[tab.id].interval = interval;
			pages[tab.id].lastRefresh = Date.now();
		} else {
			pages[tab.id] = {
				url: tab.url,
				title: tab.title,
				interval: interval,
				lastRefresh: Date.now(),
				isActive: true
			};
		}
		
		chrome.storage.local.set({pages: pages}, () => {
			updatePagesList();
			// Switch to manage tab
			document.querySelector('.tab[data-tab="manage"]').click();
			// Send message to background script to start refresh
			chrome.runtime.sendMessage({
				action: 'startRefresh',
				tabId: tab.id,
				interval: interval
			});
		});
	});
}

// Update the list of pages in the popup
function updatePagesList() {
	const pagesList = document.getElementById('pagesList');
	pagesList.innerHTML = '';

	if (Object.keys(pages).length === 0) {
		pagesList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No pages added yet</div>';
		return;
	}

	// Create a Set to track unique tab IDs
	const processedTabs = new Set();

	Object.entries(pages).forEach(([tabId, page]) => {
		// Skip if we've already processed this tab
		if (processedTabs.has(tabId)) return;
		processedTabs.add(tabId);

		// Check if tab still exists
		chrome.tabs.get(parseInt(tabId), (tab) => {
			const exists = !chrome.runtime.lastError;
			page.isActive = exists;

			const div = document.createElement('div');
			div.className = 'page-item';
			
			const timeDisplay = formatTime(page.interval);
			div.innerHTML = `
				<div class="page-info">
					<div class="page-title">${page.title}</div>
					<div class="page-meta">
						<span class="status-badge ${exists ? 'status-active' : 'status-inactive'}">
							${exists ? 'Active' : 'Inactive'}
						</span>
						<span>Refresh: ${timeDisplay}</span>
					</div>
				</div>
				<div class="actions">
					<button class="edit-btn" title="Edit refresh time">
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
						</svg>
					</button>
					<button class="delete-btn" title="Remove">
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
						</svg>
					</button>
				</div>
			`;

			// Edit button handler
			div.querySelector('.edit-btn').addEventListener('click', () => {
				const newTime = prompt('Enter new refresh time (in minutes):', page.interval / (60 * 1000));
				if (newTime && !isNaN(newTime)) {
					const newInterval = parseFloat(newTime) * 60 * 1000;
					pages[tabId].interval = newInterval;
					chrome.storage.local.set({pages: pages}, () => {
						updatePagesList();
						if (exists) {
							chrome.runtime.sendMessage({
								action: 'startRefresh',
								tabId: parseInt(tabId),
								interval: newInterval
							});
						}
					});
				}
			});

			// Delete button handler
			div.querySelector('.delete-btn').addEventListener('click', () => {
				delete pages[tabId];
				chrome.storage.local.set({pages: pages}, () => {
					updatePagesList();
					chrome.runtime.sendMessage({
						action: 'stopRefresh',
						tabId: parseInt(tabId)
					});
				});
			});

			pagesList.appendChild(div);
		});
	});
}

// Format milliseconds to human readable time
function formatTime(ms) {
	if (ms < 60000) {
		return `${Math.round(ms/1000)} seconds`;
	} else if (ms < 3600000) {
		return `${Math.round(ms/60000)} minutes`;
	} else {
		return `${Math.round(ms/3600000)} hours`;
	}
}