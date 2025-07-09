# Admin Portal

A basic but functional web interface for managing the AI Portal admin functions.

## Access

Once the server is running, access the admin portal at:
- `http://localhost:3000/admin/portal/` (or your server URL)

## Default Credentials

- **Username:** `admin`
- **Password:** `admin123!`

⚠️ **IMPORTANT:** Change the default password immediately after first login!

## Features

### Dashboard
- View statistics about users, API keys, and system status
- Quick overview of pending users requiring approval

### User Management
- View all users with their status (pending/active/admin)
- Change user status with one click
- Edit user details (username, email, password)
- See user creation date and last login

### Model Management
- View all configured models with details
- Create new model configurations
- Edit model settings (name, enabled status)
- Enable/disable models
- Delete model configurations

## Auto-Login

The portal automatically saves your admin token in localStorage and will attempt to log you in automatically on future visits. The token expires after 24 hours for security.

## Security Features

- Admin token authentication
- Automatic logout on token expiration
- Rate limiting protection
- Secure password handling (passwords are never displayed)

## Usage

1. **Login** with admin credentials
2. **Dashboard** shows system overview
3. **Users** section to manage user accounts and approvals
4. **Models** section to manage AI model configurations

The interface is designed to be functional rather than beautiful - all essential admin operations are available through simple buttons and forms.