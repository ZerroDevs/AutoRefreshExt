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
		pages[tab.id] = {
			url: tab.url,
			title: tab.title,
			interval: interval,
			lastRefresh: Date.now(),
			isActive: true
		};
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

	Object.entries(pages).forEach(([tabId, page]) => {
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
					<button class="edit-btn" title="Edit refresh time">⚙️</button>
					<button class="delete-btn" title="Remove">✕</button>
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
		return `${ms/1000} seconds`;
	} else if (ms < 3600000) {
		return `${ms/60000} minutes`;
	} else {
		return `${ms/3600000} hours`;
	}
}