class AdminPortal {
    constructor() {
        this.adminToken = localStorage.getItem('adminToken');
        this.currentUser = null;
        this.apiBase = '/api/admin';
        
        // Try auto-login if token exists
        if (this.adminToken) {
            this.loadDashboard();
        }
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });
    }

    async login() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');
        
        errorDiv.textContent = '';
        
        try {
            const response = await fetch(`${this.apiBase}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.adminToken = data.data.adminToken;
                this.currentUser = data.data.user;
                localStorage.setItem('adminToken', this.adminToken);
                this.showAdminInterface();
                this.loadDashboard();
            } else {
                errorDiv.textContent = data.error || 'Login failed';
            }
        } catch (error) {
            errorDiv.textContent = 'Login failed: ' + error.message;
        }
    }

    logout() {
        if (this.adminToken) {
            fetch(`${this.apiBase}/auth/logout`, {
                method: 'POST',
                headers: {
                    'X-Admin-Token': this.adminToken
                }
            });
        }
        
        localStorage.removeItem('adminToken');
        this.adminToken = null;
        this.currentUser = null;
        this.showLoginForm();
    }

    showLoginForm() {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('adminInterface').style.display = 'none';
    }

    showAdminInterface() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminInterface').style.display = 'block';
        if (this.currentUser) {
            document.getElementById('currentUser').textContent = this.currentUser.username;
        }
    }

    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBase}${endpoint}`;
        const headers = {
            'X-Admin-Token': this.adminToken,
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        try {
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            if (response.status === 401) {
                this.logout();
                return null;
            }
            
            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            return { success: false, error: error.message };
        }
    }

    async loadDashboard() {
        try {
            const statsData = await this.apiRequest('/dashboard/stats');
            if (statsData && statsData.success) {
                this.renderStats(statsData.data.stats);
                this.showAdminInterface();
            } else {
                this.logout();
            }
        } catch (error) {
            this.logout();
        }
    }

    renderStats(stats) {
        const container = document.getElementById('statsContainer');
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-number">${stats.totalUsers}</div>
                <div class="stat-label">Total Users</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.pendingUsers}</div>
                <div class="stat-label">Pending Users</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.activeUsers}</div>
                <div class="stat-label">Active Users</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.adminUsers}</div>
                <div class="stat-label">Admin Users</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.totalApiKeys}</div>
                <div class="stat-label">API Keys</div>
            </div>
        `;
    }

    async loadUsers() {
        const container = document.getElementById('usersContent');
        container.innerHTML = '<div class="loading">Loading users...</div>';
        
        const data = await this.apiRequest('/users');
        if (data && data.success) {
            this.renderUsers(data.data.users);
        } else {
            container.innerHTML = '<div class="error">Failed to load users</div>';
        }
    }

    renderUsers(users) {
        const container = document.getElementById('usersContent');
        
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        users.forEach(user => {
            const statusClass = `status-${user.status}`;
            const createdDate = new Date(user.created_at).toLocaleDateString();
            const lastLogin = user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never';
            
            html += `
                <tr>
                    <td>${user.id}</td>
                    <td>${user.username}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td><span class="${statusClass}">${user.status}</span></td>
                    <td>${createdDate}</td>
                    <td>${lastLogin}</td>
                    <td>
                        <button class="btn btn-success" onclick="portal.changeUserStatus(${user.id}, 'active')">Active</button>
                        <button class="btn btn-warning" onclick="portal.changeUserStatus(${user.id}, 'pending')">Pending</button>
                        <button class="btn" onclick="portal.changeUserStatus(${user.id}, 'admin')">Admin</button>
                        <button class="btn btn-warning" onclick="portal.editUser(${user.id})">Edit</button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    async changeUserStatus(userId, status) {
        if (confirm(`Change user status to ${status}?`)) {
            const data = await this.apiRequest(`/users/${userId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status })
            });
            
            if (data && data.success) {
                this.loadUsers(); // Reload users
                this.loadDashboard(); // Refresh stats
            } else {
                alert('Failed to update user status: ' + (data?.error || 'Unknown error'));
            }
        }
    }

    editUser(userId) {
        const newUsername = prompt('New username (leave empty to keep current):');
        const newEmail = prompt('New email (leave empty to keep current):');
        const newPassword = prompt('New password (leave empty to keep current):');
        
        const updates = {};
        if (newUsername && newUsername.trim()) updates.username = newUsername.trim();
        if (newEmail && newEmail.trim()) updates.email = newEmail.trim();
        if (newPassword && newPassword.trim()) updates.password = newPassword.trim();
        
        if (Object.keys(updates).length === 0) {
            alert('No changes to make');
            return;
        }
        
        this.updateUser(userId, updates);
    }

    async updateUser(userId, updates) {
        const data = await this.apiRequest(`/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
        
        if (data && data.success) {
            alert('User updated successfully');
            this.loadUsers(); // Reload users
        } else {
            alert('Failed to update user: ' + (data?.error || 'Unknown error'));
        }
    }

    async loadModels() {
        const container = document.getElementById('modelsContent');
        container.innerHTML = '<div class="loading">Loading models...</div>';
        
        const data = await this.apiRequest('/models');
        if (data && data.success) {
            this.renderModels(data.data.models);
        } else {
            container.innerHTML = '<div class="error">Failed to load models</div>';
        }
    }

    renderModels(models) {
        const container = document.getElementById('modelsContent');
        
        let html = `
            <button class="btn btn-success" onclick="portal.createModel()" style="margin-bottom: 15px;">Create New Model</button>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Display Name</th>
                        <th>Provider</th>
                        <th>API Model</th>
                        <th>Enabled</th>
                        <th>Global Rate Limit</th>
                        <th>User Rate Limit</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        models.forEach(model => {
            const globalLimit = `${model.globalRateLimit.requests}/${model.globalRateLimit.window.amount} ${model.globalRateLimit.window.unit}`;
            const userLimit = `${model.userRateLimit.requests}/${model.userRateLimit.window.amount} ${model.userRateLimit.window.unit}`;
            
            html += `
                <tr>
                    <td>${model.id}</td>
                    <td>${model.displayName}</td>
                    <td>${model.provider}</td>
                    <td>${model.apiModel}</td>
                    <td>${model.enabled ? 'Yes' : 'No'}</td>
                    <td>${globalLimit}</td>
                    <td>${userLimit}</td>
                    <td>
                        <button class="btn btn-warning" onclick="portal.editModel('${model.id}')">Edit</button>
                        <button class="btn ${model.enabled ? 'btn-danger' : 'btn-success'}" onclick="portal.toggleModel('${model.id}', ${!model.enabled})">${model.enabled ? 'Disable' : 'Enable'}</button>
                        <button class="btn btn-danger" onclick="portal.deleteModel('${model.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    createModel() {
        const id = prompt('Model ID:');
        const displayName = prompt('Display Name:');
        const provider = prompt('Provider:');
        const apiModel = prompt('API Model:');
        
        if (!id || !displayName || !provider || !apiModel) {
            alert('All fields are required');
            return;
        }
        
        const modelConfig = {
            id: id.trim(),
            displayName: displayName.trim(),
            provider: provider.trim(),
            apiModel: apiModel.trim(),
            enabled: true,
            capabilities: {},
            globalRateLimit: {
                requests: 1000,
                window: { amount: 1, unit: 'hour' }
            },
            userRateLimit: {
                requests: 50,
                window: { amount: 6, unit: 'hours' }
            }
        };
        
        this.saveNewModel(modelConfig);
    }

    async saveNewModel(modelConfig) {
        const data = await this.apiRequest('/models', {
            method: 'POST',
            body: JSON.stringify(modelConfig)
        });
        
        if (data && data.success) {
            alert('Model created successfully');
            this.loadModels(); // Reload models
        } else {
            alert('Failed to create model: ' + (data?.error || 'Unknown error'));
        }
    }

    async toggleModel(modelId, enabled) {
        const data = await this.apiRequest(`/models/${encodeURIComponent(modelId)}`, {
            method: 'PUT',
            body: JSON.stringify({ enabled })
        });
        
        if (data && data.success) {
            this.loadModels(); // Reload models
        } else {
            alert('Failed to update model: ' + (data?.error || 'Unknown error'));
        }
    }

    editModel(modelId) {
        // Simple edit for display name and enabled status
        const newDisplayName = prompt('New display name (leave empty to keep current):');
        const enabledStr = prompt('Enabled? (true/false, leave empty to keep current):');
        
        const updates = {};
        if (newDisplayName && newDisplayName.trim()) {
            updates.displayName = newDisplayName.trim();
        }
        if (enabledStr && (enabledStr.toLowerCase() === 'true' || enabledStr.toLowerCase() === 'false')) {
            updates.enabled = enabledStr.toLowerCase() === 'true';
        }
        
        if (Object.keys(updates).length === 0) {
            alert('No changes to make');
            return;
        }
        
        this.updateModel(modelId, updates);
    }

    async updateModel(modelId, updates) {
        const data = await this.apiRequest(`/models/${encodeURIComponent(modelId)}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
        
        if (data && data.success) {
            alert('Model updated successfully');
            this.loadModels(); // Reload models
        } else {
            alert('Failed to update model: ' + (data?.error || 'Unknown error'));
        }
    }

    async deleteModel(modelId) {
        if (confirm(`Delete model ${modelId}? This cannot be undone.`)) {
            const data = await this.apiRequest(`/models/${encodeURIComponent(modelId)}`, {
                method: 'DELETE'
            });
            
            if (data && data.success) {
                alert('Model deleted successfully');
                this.loadModels(); // Reload models
            } else {
                alert('Failed to delete model: ' + (data?.error || 'Unknown error'));
            }
        }
    }
}

// Global functions for navigation
function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionName).classList.add('active');
    
    // Add active class to clicked nav button
    event.target.classList.add('active');
    
    // Load data for the section
    switch(sectionName) {
        case 'dashboard':
            portal.loadDashboard();
            break;
        case 'users':
            portal.loadUsers();
            break;
        case 'models':
            portal.loadModels();
            break;
    }
}

function logout() {
    portal.logout();
}

// Initialize the portal
const portal = new AdminPortal();