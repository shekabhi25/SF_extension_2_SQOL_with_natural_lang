// Configuration settings
const API_BASE_URL = 'http://localhost:5000';
const CREDENTIALS = {
  client_id: '3MVG9rZjd7MXFdLhqknelAfepYEL534HLhdoLE8hSEnBCcR3x75zuYz7B3DGyqr.jYQxE4epZIgEGfHVnNKfs',
  client_secret: 'E29A2AEB7B5CB66312DC5E76D6EAAD0CA4A8E739767998F278CDE6BBE4D089DD',
  redirect_uri: 'https://dmpbcjpnceenbolebigjleceabcgmbfp.chromiumapp.org/callback'
};

// DOM Elements
const connectionStatus = document.getElementById('connection-status');
const authButton = document.getElementById('auth-button');
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const visualizationContainer = document.getElementById('visualization-container');
const tableContainer = document.getElementById('table-container');
const chartContainer = document.getElementById('chart-container');
const tableViewButton = document.getElementById('table-view');
const chartViewButton = document.getElementById('chart-view');
const chartTypeSelect = document.getElementById('chart-type');

// State management
let authState = {
  access_token: null,
  instance_url: null,
  isAuthenticated: false
};

let chat = {
  messages: [],
  currentQuery: null
};

let lastQueryResults = null;
let currentChart = null;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Check if this is the first time running the extension
  chrome.storage.local.get(['firstRun'], (result) => {
    if (result.firstRun !== false) {
      // Show the connection guide for first-time users
      showConnectionGuide();
      // Mark as not first run anymore
      chrome.storage.local.set({ firstRun: false });
    }
  });

  // Check for existing token in storage
  chrome.storage.local.get(['salesforceAuth'], (result) => {
    if (result.salesforceAuth) {
      authState = result.salesforceAuth;
      updateAuthStatus();
    }
  });

  // Auth button event
  authButton.addEventListener('click', initiateOAuth);

  // Send button event
  sendButton.addEventListener('click', sendUserQuery);

  // Enter key in input field
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendUserQuery();
    }
  });

  // Visualization toggle buttons
  tableViewButton.addEventListener('click', () => switchView('table'));
  chartViewButton.addEventListener('click', () => switchView('chart'));
  
  // Chart type change
  chartTypeSelect.addEventListener('change', () => {
    if (lastQueryResults) {
      renderChart(lastQueryResults);
    }
  });
});

// Authentication Functions
function initiateOAuth() {
  // Use Chrome identity API for OAuth
  addSystemMessage("Connecting to Salesforce...");
  
  // Try password flow directly if available
  if (localStorage.getItem('sf_username') && localStorage.getItem('sf_password')) {
    const username = localStorage.getItem('sf_username');
    const password = localStorage.getItem('sf_password');
    
    // Use password flow directly
    authenticateWithPassword(username, password, 'rtQOtxJTK2yflmkPSxreBXDem');
    return;
  }
  
  // Show a login form instead of redirecting
  showLoginForm();
}

function showLoginForm() {
  // Create a login form directly in the chat area
  const loginFormId = 'login-form-' + Date.now();
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message system';
  messageDiv.id = loginFormId;
  messageDiv.innerHTML = `
    <div class="message-content">
      <h3>Salesforce Login</h3>
      <p>Please enter your Salesforce credentials:</p>
      <div style="margin: 15px 0;">
        <input type="text" id="sf-username" class="sf-input" placeholder="Username" style="width: 100%; margin-bottom: 10px; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
        <input type="password" id="sf-password" class="sf-input" placeholder="Password" style="width: 100%; margin-bottom: 10px; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
        <div style="display: flex; justify-content: space-between;">
          <button id="sf-login-btn" class="btn-primary" style="flex: 1; margin-right: 5px;">Login</button>
          <button id="sf-cancel-btn" class="btn-secondary" style="flex: 1; margin-left: 5px;">Cancel</button>
        </div>
        <label style="display: flex; align-items: center; margin-top: 10px; font-size: 12px;">
          <input type="checkbox" id="sf-remember" style="margin-right: 5px;"> Remember credentials
        </label>
        <p style="font-size: 12px; margin-top: 10px; text-align: center;">
          <a href="#" id="sf-help-link" style="color: var(--primary-color);">Need help connecting?</a>
        </p>
      </div>
    </div>
  `;
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  // Add event listeners
  setTimeout(() => {
    document.getElementById('sf-login-btn').addEventListener('click', () => {
      const username = document.getElementById('sf-username').value.trim();
      const password = document.getElementById('sf-password').value.trim();
      const remember = document.getElementById('sf-remember').checked;
      
      if (!username || !password) {
        alert('Please enter both username and password');
        return;
      }
      
      // Save credentials if remember is checked
      if (remember) {
        localStorage.setItem('sf_username', username);
        localStorage.setItem('sf_password', password);
      }
      
      // Remove the login form
      messagesContainer.removeChild(document.getElementById(loginFormId));
      
      // Proceed with authentication
      authenticateWithPassword(username, password, 'rtQOtxJTK2yflmkPSxreBXDem');
    });
    
    document.getElementById('sf-cancel-btn').addEventListener('click', () => {
      messagesContainer.removeChild(document.getElementById(loginFormId));
      addSystemMessage('Authentication cancelled');
    });
    
    document.getElementById('sf-help-link').addEventListener('click', (e) => {
      e.preventDefault();
      messagesContainer.removeChild(document.getElementById(loginFormId));
      showConnectionHelp();
    });
  }, 0);
}

function showConnectionHelp() {
  addSystemMessage(`
    <h3>Connection Troubleshooting</h3>
    <p>If you're having trouble connecting to Salesforce, here are some tips:</p>
    
    <h4 style="margin-top: 10px;">1. Username Format</h4>
    <p>Make sure you're using your full Salesforce username, which is usually your email address.</p>
    
    <h4 style="margin-top: 10px;">2. Password + Security Token</h4>
    <p>For the password field, you may need to include your security token immediately after your password with no spaces.</p>
    <p><strong>Example:</strong> If your password is "mypassword" and your security token is "ABCDEFG", enter "mypasswordABCDEFG".</p>
    
    <h4 style="margin-top: 10px;">3. Security Token</h4>
    <p>The extension is configured with this security token: <code>rtQOtxJTK2yflmkPSxreBXDem</code></p>
    <p>Make sure this matches your Salesforce security token. If not, you'll need to update the code or include your token with your password.</p>
    
    <h4 style="margin-top: 10px;">4. Connected App</h4>
    <p>Verify that your Salesforce Connected App is properly configured with:</p>
    <ul style="margin-left: 20px;">
      <li>OAuth enabled</li>
      <li>Correct callback URL: <code>https://dmpbcjpnceenbolebigjleceabcgmbfp.chromiumapp.org/callback</code></li>
      <li>"Full access" scope selected</li>
    </ul>
    
    <button id="try-again-btn" class="btn-primary" style="margin-top: 15px;">Try Again</button>
  `);
  
  // Add event listener for the try again button
  setTimeout(() => {
    document.getElementById('try-again-btn').addEventListener('click', () => {
      showLoginForm();
    });
  }, 0);
}

function authenticateWithPassword(username, password, securityToken) {
  addSystemMessage("Authenticating with Salesforce...");
  
  // Check if the backend server is running
  fetch(`${API_BASE_URL}/ping`)
    .then(response => {
      // If ping succeeds, proceed with authentication
      proceedWithAuthentication();
    })
    .catch(error => {
      // If ping fails, server might be down
      addSystemMessage(`
        <p>❌ Error: Cannot connect to the backend server.</p>
        <p>Please make sure the Flask server is running at ${API_BASE_URL}.</p>
        <p>Run this command in your terminal: <code>python backend/app.py</code></p>
        <button id="retry-auth-btn" class="btn-primary" style="margin-top: 10px;">Retry</button>
      `);
      
      // Add retry button listener
      setTimeout(() => {
        document.getElementById('retry-auth-btn')?.addEventListener('click', () => {
          authenticateWithPassword(username, password, securityToken);
        });
      }, 0);
    });
  
  function proceedWithAuthentication() {
    fetch(`${API_BASE_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CREDENTIALS.client_id,
        client_secret: CREDENTIALS.client_secret,
        username: username,
        password: password,
        security_token: securityToken
      })
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(data => {
          throw new Error(data.error || `HTTP error: ${response.status}`);
        });
      }
      return response.json();
    })
    .then(data => {
      if (data.access_token) {
        authState = {
          access_token: data.access_token,
          instance_url: data.instance_url,
          isAuthenticated: true
        };
        
        // Save auth info to storage
        chrome.storage.local.set({ salesforceAuth: authState });
        
        updateAuthStatus();
        addSystemMessage('✅ Connected to Salesforce! You can now ask questions about your data.');
      } else {
        addSystemMessage(`❌ Authentication failed: ${data.error || 'Unknown error'}`);
      }
    })
    .catch(error => {
      console.error('Authentication error:', error);
      
      // Show detailed troubleshooting for specific errors
      if (error.message.includes('Failed to fetch')) {
        addSystemMessage(`
          <p>❌ Error connecting to Salesforce: Network error</p>
          <p>This could be due to:</p>
          <ul style="margin-left: 20px;">
            <li>Backend server is not running</li>
            <li>CORS issues - check browser console for details</li>
            <li>Network connectivity problems</li>
          </ul>
          <p style="margin-top: 10px;">Please make sure the Flask server is running with:</p>
          <pre style="background-color: #f5f5f5; padding: 8px; border-radius: 4px;">python backend/app.py</pre>
          <button id="show-debug-btn" class="btn-secondary" style="margin-top: 10px;">Show Debug Info</button>
          <button id="retry-conn-btn" class="btn-primary" style="margin-top: 10px; margin-left: 10px;">Retry Connection</button>
        `);
        
        // Add listeners for debug and retry buttons
        setTimeout(() => {
          document.getElementById('show-debug-btn')?.addEventListener('click', () => {
            showDebugInfo(username, CREDENTIALS.client_id);
          });
          
          document.getElementById('retry-conn-btn')?.addEventListener('click', () => {
            authenticateWithPassword(username, password, securityToken);
          });
        }, 0);
      } else {
        addSystemMessage(`❌ Error connecting to Salesforce: ${error.message}`);
      }
    });
  }
}

// Helper function to show debug info
function showDebugInfo(username, clientId) {
  addSystemMessage(`
    <h4>Debug Information</h4>
    <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">
Backend URL: ${API_BASE_URL}
Username: ${username}
Client ID: ${clientId.substring(0, 10)}...
Extension ID: ${chrome.runtime.id}
Callback URL: https://${chrome.runtime.id}.chromiumapp.org/callback
    </pre>
    <p>Please check that your backend server is running and that the callback URL in your Salesforce Connected App matches your extension ID.</p>
  `);
}

function exchangeCodeForToken(authCode) {
  fetch(`${API_BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_code: authCode,
      client_id: CREDENTIALS.client_id,
      client_secret: CREDENTIALS.client_secret,
      redirect_uri: CREDENTIALS.redirect_uri
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.access_token) {
      authState = {
        access_token: data.access_token,
        instance_url: data.instance_url,
        isAuthenticated: true
      };
      
      // Save auth info to storage
      chrome.storage.local.set({ salesforceAuth: authState });
      
      updateAuthStatus();
      addSystemMessage('Connected to Salesforce! You can now ask questions about your data.');
    } else {
      addSystemMessage(`Authentication failed: ${data.error || 'Unknown error'}`);
    }
  })
  .catch(error => {
    addSystemMessage(`Error connecting to Salesforce: ${error.message}`);
  });
}

function updateAuthStatus() {
  if (authState.isAuthenticated) {
    connectionStatus.textContent = 'Connected';
    connectionStatus.classList.add('connected');
    authButton.textContent = 'Reconnect';
  } else {
    connectionStatus.textContent = 'Not connected';
    connectionStatus.classList.remove('connected');
    authButton.textContent = 'Connect';
  }
}

// Chat & Query Functions
function sendUserQuery() {
  const query = userInput.value.trim();
  if (!query) return;
  
  // Clear input field
  userInput.value = '';
  
  // Add user message to chat
  addUserMessage(query);
  
  // Check if authenticated
  if (!authState.isAuthenticated) {
    addSystemMessage('Please connect to Salesforce first');
    return;
  }
  
  // Add loading message
  const loadingMsgId = addAssistantMessage('Generating SOQL query...', true);
  
  // Process the natural language query
  fetch(`${API_BASE_URL}/nlp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: query })
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      updateMessage(loadingMsgId, `I couldn't understand that query: ${data.error}`);
      return;
    }
    
    const soql = data.soql;
    updateMessage(loadingMsgId, `Translating your question to SOQL:\n<div class="soql-query">${soql}</div>\nExecuting query...`, true);
    
    // Execute the SOQL query against Salesforce
    return fetch(`${API_BASE_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: authState.access_token,
        instance_url: authState.instance_url,
        soql: soql
      })
    });
  })
  .then(response => response?.json())
  .then(data => {
    if (!data) return;
    
    if (data.error) {
      updateMessage(loadingMsgId, `Error executing query: ${data.error}`);
      return;
    }
    
    // Store the results for visualization
    lastQueryResults = data;
    
    // Format response message
    const totalRecords = data.totalSize;
    let responseMsg = `Found ${totalRecords} record${totalRecords !== 1 ? 's' : ''}`;
    
    updateMessage(loadingMsgId, responseMsg);
    
    // Display the results
    renderResults(data);
  })
  .catch(error => {
    updateMessage(loadingMsgId, `Error: ${error.message}`);
  });
}

// UI Manipulation Functions
function addUserMessage(text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message user';
  messageDiv.innerHTML = `
    <div class="message-content">${escapeHtml(text)}</div>
  `;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  // Add to chat history
  chat.messages.push({ role: 'user', content: text });
}

function addAssistantMessage(text, isLoading = false) {
  const messageId = 'msg-' + Date.now();
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';
  messageDiv.id = messageId;
  messageDiv.innerHTML = `
    <div class="message-content ${isLoading ? 'loading' : ''}">${text}</div>
  `;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  // Add to chat history
  chat.messages.push({ role: 'assistant', content: text, id: messageId });
  
  return messageId;
}

function addSystemMessage(text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message system';
  messageDiv.innerHTML = `
    <div class="message-content">${text}</div>
  `;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateMessage(messageId, text, isLoading = false) {
  const messageDiv = document.getElementById(messageId);
  if (messageDiv) {
    const contentDiv = messageDiv.querySelector('.message-content');
    contentDiv.innerHTML = text;
    
    if (isLoading) {
      contentDiv.classList.add('loading');
    } else {
      contentDiv.classList.remove('loading');
    }
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Update in chat history
    const msgIndex = chat.messages.findIndex(m => m.id === messageId);
    if (msgIndex >= 0) {
      chat.messages[msgIndex].content = text;
    }
  }
}

// Visualization Functions
function renderResults(data) {
  if (data.totalSize === 0) {
    visualizationContainer.classList.add('hidden');
    return;
  }
  
  // Show visualization container
  visualizationContainer.classList.remove('hidden');
  
  // Determine best visualization based on hints
  const vizHint = data.visualization_hint || { type: 'table' };
  
  // Create table view
  renderTable(data);
  
  // Create chart if appropriate
  if (vizHint.type === 'chart' && vizHint.recommended_chart) {
    chartTypeSelect.value = vizHint.recommended_chart;
    renderChart(data);
    switchView('chart');
  } else {
    switchView('table');
  }
}

function renderTable(data) {
  if (!data || !data.records || data.records.length === 0) return;
  
  // Create table
  const table = document.createElement('table');
  
  // Get all field names (headers) from the first record
  const firstRecord = data.records[0];
  const headers = Object.keys(firstRecord).filter(key => key !== 'attributes');
  
  // Create table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = formatFieldName(header);
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Create table body
  const tbody = document.createElement('tbody');
  
  data.records.forEach(record => {
    const row = document.createElement('tr');
    
    headers.forEach(header => {
      const td = document.createElement('td');
      td.textContent = formatCellValue(record[header]);
      row.appendChild(td);
    });
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  
  // Add to container
  tableContainer.innerHTML = '';
  tableContainer.appendChild(table);
}

function renderChart(data) {
  if (!data || !data.records || data.records.length === 0) return;
  
  // Destroy previous chart if exists
  if (currentChart) {
    currentChart.destroy();
  }
  
  // Ensure chart container is visible
  document.getElementById('chart-container').classList.remove('hidden');
  
  const vizHint = data.visualization_hint || {};
  const chartType = chartTypeSelect.value || vizHint.recommended_chart || 'bar';
  
  // Default axes if not provided in hint
  let xAxisField = vizHint.x_axis;
  let yAxisField = vizHint.y_axis;
  
  // If no hint, try to find reasonable fields for x and y axes
  if (!xAxisField || !yAxisField) {
    const firstRecord = data.records[0];
    const fields = Object.keys(firstRecord).filter(key => key !== 'attributes');
    
    // Try to find a categorical field for x-axis
    xAxisField = fields.find(field => 
      typeof firstRecord[field] === 'string' && 
      !field.toLowerCase().includes('id')
    ) || fields[0];
    
    // Try to find a numeric field for y-axis
    yAxisField = fields.find(field => 
      typeof firstRecord[field] === 'number' || 
      (typeof firstRecord[field] === 'string' && !isNaN(parseFloat(firstRecord[field])))
    );
    
    // If no numeric field, use count
    if (!yAxisField) {
      yAxisField = 'count';
    }
  }
  
  console.log(`Creating chart: type=${chartType}, x=${xAxisField}, y=${yAxisField}`);
  
  // Prepare data for chart
  const labels = data.records.map(record => formatCellValue(record[xAxisField]));
  
  // Handle the y-axis data properly
  let chartData;
  if (yAxisField === 'count') {
    // Count by x-axis categories
    const counts = {};
    data.records.forEach(record => {
      const key = formatCellValue(record[xAxisField]);
      counts[key] = (counts[key] || 0) + 1;
    });
    chartData = labels.map(label => counts[label]);
  } else {
    chartData = data.records.map(record => {
      const value = record[yAxisField];
      return typeof value === 'number' ? value : parseFloat(value) || 0;
    });
  }
  
  // First try client-side charting with Chart.js
  if (typeof Chart !== 'undefined') {
    try {
      renderClientSideChart(chartType, labels, chartData, xAxisField, yAxisField);
      return;
    } catch (error) {
      console.error("Client-side chart error:", error);
      // Fall back to server-side charting
    }
  } else {
    console.log("Chart.js not available, falling back to server-side charting");
  }
  
  // Fallback to server-side chart generation
  renderServerSideChart(chartType, labels, chartData, xAxisField, yAxisField);
}

function renderClientSideChart(chartType, labels, chartData, xAxisField, yAxisField) {
  // Get the canvas and create chart
  const canvas = document.getElementById('chart-canvas');
  const ctx = canvas.getContext('2d');
  
  // Check if canvas is accessible
  if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
  }
  
  // Clear the canvas first
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const chartColors = getChartColors(chartType, chartData.length);
  
  currentChart = new Chart(ctx, {
    type: chartType,
    data: {
      labels: labels,
      datasets: [{
        label: formatFieldName(yAxisField),
        data: chartData,
        backgroundColor: chartColors,
        borderColor: chartType === 'line' ? '#0176d3' : chartColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: chartType === 'pie',
          position: 'top',
        },
        title: {
          display: true,
          text: `${formatFieldName(yAxisField)} by ${formatFieldName(xAxisField)}`
        }
      },
      animation: {
        duration: 1000
      }
    }
  });
  
  console.log("Client-side chart created successfully");
}

function renderServerSideChart(chartType, labels, chartData, xAxisField, yAxisField) {
  // Show loading indicator
  const chartContainer = document.getElementById('chart-container');
  chartContainer.innerHTML = '<div style="display: flex; justify-content: center; align-items: center; height: 100%;"><p>Generating chart...</p></div>';

  // Request a chart from the server
  fetch(`${API_BASE_URL}/generate-chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chartType: chartType,
      labels: labels,
      chartData: chartData,
      title: `${formatFieldName(yAxisField)} by ${formatFieldName(xAxisField)}`,
      xAxisLabel: formatFieldName(xAxisField),
      yAxisLabel: formatFieldName(yAxisField)
    })
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(data => {
        throw new Error(data.error || `HTTP error: ${response.status}`);
      });
    }
    return response.json();
  })
  .then(data => {
    // Display the chart as an image
    chartContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; height: 100%;">
        <img src="${data.chartImage}" alt="Chart" style="max-width: 100%; max-height: 100%;">
      </div>
    `;
    console.log("Server-side chart created successfully");
  })
  .catch(error => {
    console.error("Server-side chart error:", error);
    chartContainer.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <p>Error creating chart: ${error.message}</p>
        <button id="retry-chart-btn" class="btn-primary">Retry</button>
      </div>
    `;
    
    // Add retry button listener
    setTimeout(() => {
      document.getElementById('retry-chart-btn')?.addEventListener('click', () => {
        renderServerSideChart(chartType, labels, chartData, xAxisField, yAxisField);
      });
    }, 0);
  });
}

function switchView(view) {
  if (view === 'table') {
    tableContainer.classList.remove('hidden');
    chartContainer.classList.add('hidden');
    tableViewButton.classList.add('active');
    chartViewButton.classList.remove('active');
  } else {
    tableContainer.classList.add('hidden');
    chartContainer.classList.remove('hidden');
    tableViewButton.classList.remove('active');
    chartViewButton.classList.add('active');
  }
}

// Helper Functions
function formatFieldName(fieldName) {
  if (!fieldName) return '';
  // Convert camelCase or snake_case to Title Case with spaces
  return fieldName
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .replace(/_/g, ' ')         // Replace underscores with spaces
    .replace(/^\w/, c => c.toUpperCase()) // Capitalize first letter
    .trim();
}

function formatCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  
  // Format dates
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return new Date(value).toLocaleString();
  }
  
  return value.toString();
}

function getChartColors(chartType, count) {
  const baseColors = [
    'rgba(1, 118, 211, 0.8)',    // blue
    'rgba(46, 132, 74, 0.8)',    // green
    'rgba(229, 103, 152, 0.8)',  // pink
    'rgba(248, 137, 98, 0.8)',   // orange
    'rgba(107, 109, 112, 0.8)',  // gray
    'rgba(90, 27, 169, 0.8)',    // purple
    'rgba(212, 80, 76, 0.8)',    // red
    'rgba(50, 150, 237, 0.8)',   // light blue
    'rgba(127, 217, 95, 0.8)',   // light green
    'rgba(194, 122, 199, 0.8)'   // light purple
  ];
  
  // For pie charts, return all colors
  if (chartType === 'pie') {
    // If we need more colors than in our base set, generate them
    if (count > baseColors.length) {
      const colors = [...baseColors];
      for (let i = baseColors.length; i < count; i++) {
        const hue = (i * 137.5) % 360; // Use golden ratio for even distribution
        colors.push(`hsla(${hue}, 70%, 60%, 0.8)`);
      }
      return colors;
    }
    return baseColors.slice(0, count);
  }
  
  // For other chart types, return one color or array depending on dataset
  return chartType === 'line' ? 'rgba(1, 118, 211, 0.8)' : baseColors;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showConnectionGuide() {
  addSystemMessage(`
    <h3>Welcome to Salesforce SOQL Assistant!</h3>
    <p>To get started, you need to connect to your Salesforce organization.</p>
    <ol style="margin-left: 20px; margin-top: 10px;">
      <li>Click the <strong>Connect</strong> button above</li>
      <li>Enter your Salesforce username and password</li>
      <li>If you're having trouble, ensure you're adding your security token after your password</li>
    </ol>
    <p style="margin-top: 10px;">Once connected, you can ask questions about your Salesforce data like:</p>
    <ul style="margin-left: 20px; margin-top: 5px;">
      <li>"Show me all Accounts in California"</li>
      <li>"Find top 10 Opportunities by Amount"</li>
      <li>"List all Contacts at Acme Corp"</li>
    </ul>
  `);
} 