// Initialize side panel when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Register the side panel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  
  // Store the callback URL for future reference
  chrome.storage.local.set({ 
    callbackUrl: 'https://dmpbcjpnceenbolebigjleceabcgmbfp.chromiumapp.org/callback',
    clientDetails: {
      client_id: '3MVG9rZjd7MXFdLhqknelAfepYEL534HLhdoLE8hSEnBCcR3x75zuYz7B3DGyqr.jYQxE4epZIgEGfHVnNKfs',
      client_secret: 'E29A2AEB7B5CB66312DC5E76D6EAAD0CA4A8E739767998F278CDE6BBE4D089DD'
    }
  });
});

// When the user navigates to a Salesforce domain, show our extension
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && 
      (tab.url.includes("salesforce.com") || 
       tab.url.includes("force.com") || 
       tab.url.includes("lightning.force.com"))) {
    chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel.html",
      enabled: true
    });
  }
});

// Listen for messages from sidepanel or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getToken") {
    // Handle token retrieval
    sendResponse({ status: "success" });
    return true;
  }
  
  // Provide stored credentials if requested
  if (message.action === "getCredentials") {
    chrome.storage.local.get(['callbackUrl', 'clientDetails'], (result) => {
      sendResponse({
        callbackUrl: result.callbackUrl,
        clientDetails: result.clientDetails
      });
    });
    return true;
  }
}); 