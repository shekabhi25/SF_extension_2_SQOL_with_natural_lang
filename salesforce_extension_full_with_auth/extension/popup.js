async function sendQuery() {
  const prompt = document.getElementById("prompt").value;
  const output = document.getElementById("output");

  const nlpRes = await fetch("http://localhost:5000/nlp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const nlpData = await nlpRes.json();
  if (!nlpData.soql) {
    output.textContent = "NLP failed: " + (nlpData.error || "unknown error");
    return;
  }

  const authData = {
    client_id: "3MVG9rZjd7MXFdLhqknelAfepYEL534HLhdoLE8hSEnBCcR3x75zuYz7B3DGyqr.jYQxE4epZIgEGfHVnNKfs",
    client_secret: "E29A2AEB7B5CB66312DC5E76D6EAAD0CA4A8E739767998F278CDE6BBE4D089DD",
    username: "YOUR_SF_USERNAME",
    password: "YOUR_PASSWORD",
    security_token: "rtQOtxJTK2yflmkPSxreBXDem"
  };

  const authRes = await fetch("http://localhost:5000/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authData)
  });

  const auth = await authRes.json();
  const soqlRes = await fetch("http://localhost:5000/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: auth.access_token,
      instance_url: auth.instance_url,
      soql: nlpData.soql
    })
  });

  const soqlData = await soqlRes.json();
  output.textContent = JSON.stringify(soqlData, null, 2);
}

// Wait for the DOM to load
document.addEventListener('DOMContentLoaded', function() {
  // Get button elements
  const openSidePanelButton = document.getElementById('open-side-panel');
  const openOptionsButton = document.getElementById('open-options');
  
  // Open side panel when button is clicked
  openSidePanelButton.addEventListener('click', function() {
    // Try to get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0]) {
        // Get the active tab ID
        const tabId = tabs[0].id;
        
        // Open the side panel for this tab
        if (chrome.sidePanel) {
          chrome.sidePanel.open({ tabId });
          window.close(); // Close the popup
        } else {
          // Fallback for older Chrome versions
          showMessage('Side panel not supported in this version of Chrome.');
        }
      }
    });
  });
  
  // For now, just show a message when options button is clicked
  // In a future version, this could open an options page
  openOptionsButton.addEventListener('click', function() {
    showMessage('Settings configuration will be available in a future update.');
  });
  
  // Helper function to show messages
  function showMessage(text) {
    const message = document.createElement('div');
    message.style.cssText = 'margin-top: 15px; padding: 10px; background-color: #f8f8f8; border-radius: 4px; text-align: center;';
    message.textContent = text;
    
    // Add to body
    document.body.appendChild(message);
    
    // Remove after 3 seconds
    setTimeout(() => {
      document.body.removeChild(message);
    }, 3000);
  }
});
