# Salesforce SOQL Assistant

A Chrome extension that helps Salesforce administrators and developers query their org data using natural language, with visualizations and a modern interface.

![Salesforce SOQL Assistant](extension/icon.png)

## Features

- **Natural Language Queries**: Ask questions about your Salesforce data in plain English
- **SOQL Generation**: Automatically converts natural language to SOQL queries
- **Data Visualizations**: View query results as tables or charts (bar, pie, line)
- **Side Panel Interface**: Works directly within your Salesforce org in a convenient side panel
- **Authentication**: Securely connects to your Salesforce org using OAuth 2.0
- **AI-powered**: Uses Google's Gemini AI for advanced query generation

## Installation

### Prerequisites

1. Python 3.7+ with pip
2. Chrome browser
3. A Salesforce account
4. A Salesforce Connected App (already configured)

### Backend Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/salesforce-soql-assistant.git
   cd salesforce-soql-assistant
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   pip install flask flask-cors requests google-generativeai
   ```

3. The Gemini API key is already configured in the app:
   ```python
   os.environ['GOOGLE_API_KEY'] = "AIzaSyBlpyTc48FxdP7pzsPTK36EVO_Y0QKhkQg"
   ```

4. Start the Flask server:
   ```bash
   python app.py
   ```

### Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" by toggling the switch in the top-right corner
3. Click "Load unpacked" and select the `extension` directory from this repository
4. The extension icon should now appear in your Chrome toolbar

## Salesforce Connected App Details

The extension is already configured with the following credentials:

- **Consumer Key**: 3MVG9rZjd7MXFdLhqknelAfepYEL534HLhdoLE8hSEnBCcR3x75zuYz7B3DGyqr.jYQxE4epZIgEGfHVnNKfs
- **Consumer Secret**: E29A2AEB7B5CB66312DC5E76D6EAAD0CA4A8E739767998F278CDE6BBE4D089DD
- **Security Token**: rtQOtxJTK2yflmkPSxreBXDem
- **Callback URL**: https://dmpbcjpnceenbolebigjleceabcgmbfp.chromiumapp.org/callback

## Usage

1. Make sure the backend server is running (`python backend/app.py`)
2. Visit your Salesforce org in Chrome
3. Click the extension icon to open the side panel (or use the "Open Side Panel" button)
4. Connect to Salesforce using the "Connect" button
5. Type your query in natural language (e.g., "Show me all Accounts in California")
6. View the results in table or chart format

## Example Queries

- "Show me all Accounts in New York"
- "Find top 10 Opportunities by Amount"
- "List all Contacts at Acme Corp"
- "Show Opportunity count by Stage"
- "Find all Cases with High priority created this month"

## Troubleshooting

- If you're having connection issues, make sure:
  - The backend Flask server is running
  - You're using the correct Salesforce credentials when logging in
  - The extension has the necessary permissions to access Salesforce
- For visualization issues, check that your query returns some data
- CORS issues can occur in development; you may need to adjust your browser settings

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Salesforce for their powerful API
- Google for the Gemini AI model
- Chart.js for data visualization
- Chrome Extension API for side panel functionality 