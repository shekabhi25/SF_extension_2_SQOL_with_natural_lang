from flask import Flask, request, jsonify, send_file
import requests
import os
import json
import re
import logging
import io
import base64
from flask_cors import CORS
import google.generativeai as genai

# For chart generation
try:
    import matplotlib
    matplotlib.use('Agg')  # Use non-interactive backend
    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd
    HAS_CHART_LIBS = True
except ImportError:
    HAS_CHART_LIBS = False
    logging.warning("Matplotlib, Numpy, or Pandas not found. Server-side charting disabled.")

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Enable CORS with more specific settings
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

# Configure Gemini API
os.environ['GOOGLE_API_KEY'] = "AIzaSyBlpyTc48FxdP7pzsPTK36EVO_Y0QKhkQg"
genai.configure(api_key=os.environ['GOOGLE_API_KEY'])

# Salesforce API version
SF_API_VERSION = 'v59.0'

# Default callback URL
DEFAULT_CALLBACK_URL = 'https://dmpbcjpnceenbolebigjleceabcgmbfp.chromiumapp.org/callback'

@app.route('/auth', methods=['POST', 'OPTIONS'])
def authenticate():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        data = request.json
        logger.info(f"Auth request received, type: {'OAuth' if data.get('auth_code') else 'Password'}")
        
        # OAuth 2.0 Web Server Flow
        if data.get('auth_code'):
            # Handle OAuth 2.0 callback
            payload = {
                'grant_type': 'authorization_code',
                'client_id': data['client_id'],
                'client_secret': data['client_secret'],
                'code': data['auth_code'],
                'redirect_uri': data.get('redirect_uri', DEFAULT_CALLBACK_URL)
            }
            logger.info(f"Attempting OAuth flow with redirect URI: {payload['redirect_uri']}")
            response = requests.post('https://login.salesforce.com/services/oauth2/token', data=payload)
        
        # OAuth 2.0 Username-Password Flow
        else:
            logger.info(f"Using username-password flow for user: {data.get('username')}")
            # Make sure we have the required fields
            if not data.get('client_id') or not data.get('client_secret') or not data.get('username') or not data.get('password'):
                missing = []
                if not data.get('client_id'): missing.append('client_id')
                if not data.get('client_secret'): missing.append('client_secret')
                if not data.get('username'): missing.append('username')
                if not data.get('password'): missing.append('password')
                logger.error(f"Missing required fields: {', '.join(missing)}")
                return jsonify({'error': f"Missing required fields: {', '.join(missing)}"}), 400
                
            payload = {
                'grant_type': 'password',
                'client_id': data['client_id'],
                'client_secret': data['client_secret'],
                'username': data['username'],
                'password': data['password'] + data.get('security_token', 'rtQOtxJTK2yflmkPSxreBXDem')
            }
            logger.info("Sending authentication request to Salesforce...")
            try:
                response = requests.post('https://login.salesforce.com/services/oauth2/token', data=payload, timeout=10)
                logger.info(f"Received response: Status {response.status_code}")
            except requests.exceptions.RequestException as e:
                logger.error(f"Network error during Salesforce authentication: {str(e)}")
                return jsonify({'error': f"Network error: {str(e)}"}), 500
        
        # Process the response
        if response.status_code != 200:
            logger.error(f"Authentication failed: {response.status_code} - {response.text}")
            error_message = "Authentication failed"
            try:
                error_details = response.json()
                if 'error_description' in error_details:
                    error_message = error_details['error_description']
                elif 'error' in error_details:
                    error_message = error_details['error']
            except:
                error_message = f"HTTP Error: {response.status_code}"
                
            return jsonify({'error': error_message}), 400
            
        logger.info("Authentication successful")
        return jsonify(response.json())
    except Exception as e:
        logger.exception("Authentication error")
        return jsonify({'error': f"Authentication error: {str(e)}"}), 500

@app.route('/query', methods=['POST'])
def query_salesforce():
    try:
        data = request.json
        headers = {
            'Authorization': f"Bearer {data['access_token']}",
            'Content-Type': 'application/json'
        }
        
        # URL encode the SOQL query
        encoded_soql = requests.utils.quote(data['soql'])
        
        # Make the request to Salesforce
        response = requests.get(
            f"{data['instance_url']}/services/data/{SF_API_VERSION}/query/?q={encoded_soql}", 
            headers=headers
        )
        
        if response.status_code != 200:
            return jsonify({'error': f"Query failed: {response.text}"}), response.status_code
            
        result = response.json()
        
        # Add metadata for visualization
        result['visualization_hint'] = get_visualization_hint(data['soql'], result)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f"Query error: {str(e)}"}), 500

@app.route('/describe', methods=['POST'])
def describe_object():
    """Get the metadata about a Salesforce object to help with natural language processing"""
    try:
        data = request.json
        headers = {
            'Authorization': f"Bearer {data['access_token']}",
            'Content-Type': 'application/json'
        }
        
        response = requests.get(
            f"{data['instance_url']}/services/data/{SF_API_VERSION}/sobjects/{data['object_name']}/describe", 
            headers=headers
        )
        
        if response.status_code != 200:
            return jsonify({'error': f"Describe failed: {response.text}"}), response.status_code
            
        return jsonify(response.json())
    except Exception as e:
        return jsonify({'error': f"Describe error: {str(e)}"}), 500

@app.route('/nlp', methods=['POST'])
def nlp_to_soql():
    try:
        prompt = request.json['prompt']
        
        # Check if Gemini API is configured
        if os.environ.get('GOOGLE_API_KEY'):
            # Use Gemini for advanced NLP to SOQL conversion
            return generate_soql_with_gemini(prompt)
        else:
            # Fallback to basic rule-based conversion
            return basic_nlp_to_soql(prompt)
    except Exception as e:
        return jsonify({'error': f"NLP processing error: {str(e)}"}), 500

def basic_nlp_to_soql(prompt):
    """Basic rule-based NLP to SOQL conversion when Gemini API is not available"""
    prompt_lower = prompt.lower()
    
    # Dictionary of common object mappings
    common_objects = {
        'account': {'fields': ['Id', 'Name', 'Industry', 'Type', 'BillingCity', 'Phone']},
        'contact': {'fields': ['Id', 'FirstName', 'LastName', 'Email', 'Phone', 'Title', 'AccountId']},
        'opportunity': {'fields': ['Id', 'Name', 'StageName', 'Amount', 'CloseDate', 'AccountId']},
        'lead': {'fields': ['Id', 'FirstName', 'LastName', 'Company', 'Status', 'Email', 'Phone']},
        'case': {'fields': ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'ContactId']},
    }
    
    # Extract object name from prompt
    object_match = None
    for obj in common_objects.keys():
        if obj in prompt_lower or f"{obj}s" in prompt_lower:
            object_match = obj
            break
    
    if not object_match:
        return jsonify({'error': 'Could not determine which Salesforce object you are asking about'}), 400
    
    # Build SOQL query
    fields = ', '.join(common_objects[object_match]['fields'])
    soql = f"SELECT {fields} FROM {object_match.capitalize()}"
    
    # Handle some common filter patterns
    if "where" in prompt_lower:
        # Extract the condition after "where"
        where_part = prompt_lower.split("where")[1].strip()
        
        # Simple condition handling (very basic)
        if "=" in where_part:
            parts = where_part.split("=")
            field = parts[0].strip().title()
            value = parts[1].strip()
            
            # Check if it's a string value
            if not value.isdigit():
                value = f"'{value}'"
                
            soql += f" WHERE {field} = {value}"
        else:
            # Just add the basic condition pattern
            soql += f" WHERE {where_part}"
    
    # Add limit
    if "limit" in prompt_lower:
        limit_match = re.search(r'limit\s+(\d+)', prompt_lower)
        if limit_match:
            limit = limit_match.group(1)
            soql += f" LIMIT {limit}"
    else:
        soql += " LIMIT 100"  # Default limit
    
    return jsonify({"soql": soql})

def generate_soql_with_gemini(prompt):
    """Use Google's Gemini model to convert natural language to SOQL"""
    try:
        # Set up Gemini
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # System prompt to guide Gemini in SOQL generation
        system_prompt = """
        You are a Salesforce SOQL query generator. Convert the natural language query to a valid SOQL query.
        
        Follow these rules:
        1. Only respond with the valid SOQL query, nothing else.
        2. Use standard Salesforce object names and field names.
        3. Always include a LIMIT clause for safety (default 100 if not specified).
        4. Be mindful of quotes around string values.
        5. Use proper date formatting for date fields (YYYY-MM-DD).
        6. Support basic aggregation functions when requested (COUNT(), SUM(), etc.).
        7. If you can't create a valid SOQL query, respond with "ERROR: " followed by a brief explanation.
        
        Examples:
        "Show me all Accounts in New York" → SELECT Id, Name, Phone, Industry FROM Account WHERE BillingState = 'New York' LIMIT 100
        "Find top 5 Opportunities by Amount" → SELECT Id, Name, Amount, CloseDate FROM Opportunity ORDER BY Amount DESC LIMIT 5
        """
        
        chat = model.start_chat(history=[
            {'role': 'user', 'parts': [system_prompt]},
            {'role': 'model', 'parts': ['I understand my role as a SOQL query generator. I will convert natural language queries to valid SOQL queries following the rules you provided.']}
        ])
        
        response = chat.send_message(prompt)
        result = response.text.strip()
        
        # Check if the response starts with an error
        if result.startswith("ERROR:"):
            return jsonify({"error": result[7:].strip()}), 400
            
        return jsonify({"soql": result})
    except Exception as e:
        return jsonify({"error": f"Gemini API error: {str(e)}"}), 500

def get_visualization_hint(soql, result):
    """Determine the best visualization method based on the SOQL query and results"""
    try:
        soql_lower = soql.lower()
        
        # Default to table view
        visualization = {
            'type': 'table',
            'recommended_chart': None,
            'x_axis': None,
            'y_axis': None
        }
        
        # If no records, just return table view
        if result.get('totalSize', 0) == 0:
            return visualization
            
        # Check for aggregate queries (likely good for charts)
        is_aggregate = any(agg in soql_lower for agg in ['count(', 'sum(', 'avg(', 'min(', 'max(', 'groupby'])
        
        # Check if there's a date field which might be good for trend analysis
        has_date = any('date' in field.lower() for field in result['records'][0].keys() if isinstance(field, str))
        
        # Determine if there are categorical fields good for grouping
        categorical_fields = ['type', 'industry', 'status', 'stagename', 'rating', 'priority']
        has_categorical = any(cat in field.lower() for field in result['records'][0].keys() if isinstance(field, str) 
                             for cat in categorical_fields)
        
        # Has numeric values (good for bar/line charts)
        numeric_fields = [k for k, v in result['records'][0].items() 
                         if isinstance(v, (int, float)) or (isinstance(k, str) and any(num in k.lower() for num in ['amount', 'sum', 'count', 'total']))]
        
        # Make visualization recommendations
        if is_aggregate and numeric_fields:
            # For aggregate queries with numeric values, pie or bar charts work well
            if 'groupby' in soql_lower and len(result['records']) <= 10:
                # For smaller grouped results, pie charts work well
                categorical_field = next((field for field in result['records'][0].keys() 
                                          if isinstance(field, str) and any(cat in field.lower() for cat in categorical_fields)), 
                                         next(iter(result['records'][0].keys())))
                                         
                numeric_field = numeric_fields[0]
                
                visualization = {
                    'type': 'chart',
                    'recommended_chart': 'pie',
                    'x_axis': categorical_field,
                    'y_axis': numeric_field
                }
            else:
                # For other aggregates, bar charts work well
                visualization = {
                    'type': 'chart',
                    'recommended_chart': 'bar',
                    'x_axis': next(iter(result['records'][0].keys())),
                    'y_axis': numeric_fields[0]
                }
        
        elif has_date and numeric_fields:
            # Time series data is great for line charts
            date_field = next(field for field in result['records'][0].keys() 
                             if isinstance(field, str) and 'date' in field.lower())
            
            visualization = {
                'type': 'chart',
                'recommended_chart': 'line',
                'x_axis': date_field,
                'y_axis': numeric_fields[0]
            }
            
        elif has_categorical and numeric_fields and len(result['records']) <= 20:
            # Categorical data with numeric values works well for bar charts
            cat_field = next(field for field in result['records'][0].keys() 
                            if isinstance(field, str) and any(cat in field.lower() for cat in categorical_fields))
            
            visualization = {
                'type': 'chart',
                'recommended_chart': 'bar',
                'x_axis': cat_field,
                'y_axis': numeric_fields[0]
            }
        
        return visualization
    
    except Exception:
        # If error in determining visualization, default to table
        return {'type': 'table', 'recommended_chart': None, 'x_axis': None, 'y_axis': None}

@app.route('/generate-chart', methods=['POST', 'OPTIONS'])
def generate_chart():
    """Generate chart on the server side and return as base64 image"""
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        if not HAS_CHART_LIBS:
            return jsonify({
                'error': 'Server-side chart generation not available. Install matplotlib, numpy, and pandas.'
            }), 400
            
        data = request.json
        if not data or not data.get('chartData') or not data.get('chartType'):
            return jsonify({'error': 'Invalid chart data provided'}), 400
            
        chart_type = data['chartType']
        labels = data.get('labels', [])
        dataset = data.get('chartData', [])
        title = data.get('title', 'Chart')
        x_axis_label = data.get('xAxisLabel', '')
        y_axis_label = data.get('yAxisLabel', '')
        
        logger.info(f"Generating {chart_type} chart with {len(dataset)} data points")
        
        # Create a figure
        plt.figure(figsize=(10, 6))
        
        # Generate the chart based on type
        if chart_type == 'bar':
            plt.bar(labels, dataset, color='royalblue')
            plt.xticks(rotation=45, ha='right')
            
        elif chart_type == 'line':
            plt.plot(labels, dataset, marker='o', linestyle='-', color='royalblue')
            plt.xticks(rotation=45, ha='right')
            
        elif chart_type == 'pie':
            # Filter out zero values for pie chart
            filtered_data = [(l, d) for l, d in zip(labels, dataset) if d > 0]
            if filtered_data:
                filtered_labels, filtered_dataset = zip(*filtered_data)
                plt.pie(filtered_dataset, labels=filtered_labels, autopct='%1.1f%%', 
                       shadow=True, startangle=90)
                plt.axis('equal')  # Equal aspect ratio ensures that pie is drawn as a circle
            else:
                return jsonify({'error': 'No non-zero data for pie chart'}), 400
                
        else:
            return jsonify({'error': f'Unsupported chart type: {chart_type}'}), 400
            
        # Add labels and title
        plt.title(title)
        if chart_type != 'pie':
            plt.xlabel(x_axis_label)
            plt.ylabel(y_axis_label)
            
        plt.tight_layout()
        
        # Save the figure to a bytes buffer
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100)
        buf.seek(0)
        
        # Convert to base64 for embedding in HTML
        img_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        plt.close()
        
        return jsonify({
            'chartImage': f'data:image/png;base64,{img_base64}',
            'message': 'Chart generated successfully'
        })
        
    except Exception as e:
        logger.exception("Chart generation error")
        return jsonify({'error': f"Chart generation error: {str(e)}"}), 500

@app.route('/ping', methods=['GET', 'OPTIONS'])
def ping():
    """Simple endpoint to check if the server is running"""
    if request.method == 'OPTIONS':
        return '', 200
    return jsonify({"status": "ok", "message": "Server is running"}), 200

if __name__ == '__main__':
    app.run(debug=True)
