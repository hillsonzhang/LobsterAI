param(
    [string]$HomeDir = "",
    [int]$MaxRetries = 3,
    [int]$RetryDelaySeconds = 2
)

# Enhanced logging function
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp][$Level] $Message"
}

# Function to install a tool with retry
function Install-Tool {
    param(
        [string]$ToolName
    )

    Write-Log "Installing $ToolName..." "INFO"

    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            & $MsetExe --install $ToolName
            if ($LASTEXITCODE -eq 0) {
                Write-Log "$ToolName installed successfully" "SUCCESS"
                return $true
            } else {
                Write-Log "Failed to install $ToolName (attempt $attempt/$MaxRetries)" "ERROR"
            }
        }
        catch {
            Write-Log "Exception during $ToolName installation (attempt $attempt/$MaxRetries): $($_.Exception.Message)" "ERROR"
        }

        if ($attempt -lt $MaxRetries) {
            Write-Log "Retrying in $RetryDelaySeconds seconds..." "INFO"
            Start-Sleep -Seconds $RetryDelaySeconds
        }
    }

    Write-Log "Failed to install $ToolName after $MaxRetries attempts" "ERROR"
    return $false
}

# Function to set environment variables safely
function Set-EnvironmentVariable {
    param(
        [string]$Name,
        [string]$Value,
        [EnvironmentVariableTarget]$Target
    )

    try {
        [Environment]::SetEnvironmentVariable($Name, $Value, $Target)
        Write-Log "Successfully set $Name environment variable" "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Failed to set $Name environment variable: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# Function to add to PATH safely
function Add-ToPath {
    param(
        [string]$Path,
        [EnvironmentVariableTarget]$Target
    )

    # Get current PATH
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", $Target)
    if (-not $currentPath) {
        $currentPath = ""
    }

    # Check if path already exists (exact match)
    $pathArray = $currentPath -split ';'
    if ($Path -in $pathArray) {
        Write-Log "Path $Path already exists in PATH" "INFO"
        return $true
    }

    # Add to PATH
    try {
        if ($currentPath -eq "") {
            $newPath = $Path
        } else {
            $newPath = "$Path;$currentPath"
        }

        [Environment]::SetEnvironmentVariable("PATH", $newPath, $Target)
        Write-Log "Successfully added $Path to PATH environment variable" "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Failed to add $Path to PATH: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# Main script execution starts here
$BinDir = $PSScriptRoot
$MsetExe = Join-Path $BinDir "mset.exe"

Write-Log "========================================" "INFO"
Write-Log "MSET Auto Install Script (Enhanced)" "INFO"
Write-Log "========================================" "INFO"
Write-Log "" "INFO"
Write-Log "BIN_DIR: $BinDir" "INFO"

# Set MSET_HOME based on command line argument or default to parent directory of bin
if ($HomeDir) {
    $MsetHome = $HomeDir
} else {
    $MsetHome = Split-Path $BinDir -Parent
}

Write-Log "Setting MSET_HOME=$MsetHome" "INFO"

# Check if mset.exe exists
if (-not (Test-Path $MsetExe)) {
    Write-Log "mset.exe not found in the script directory" "ERROR"
    Write-Log "Please ensure mset.exe is in the same directory as this script: $PSScriptRoot" "ERROR"
    exit 1
}

# Set temporary environment variables for current session BEFORE installation
Write-Log "Setting up temporary environment for current session..." "INFO"
$env:MSET_HOME = $MsetHome
$env:PATH = "$BinDir;$env:PATH"
Write-Log "Temporary environment variables set" "SUCCESS"

Write-Log "Installing default versions:" "INFO"
Write-Log "- Node.js v22.16.0" "INFO"
Write-Log "- UV v0.7.11" "INFO"
Write-Log "" "INFO"

# Initialize success tracking
$installationSuccess = $true
$failedTools = @()

# Install Node.js v22.16.0
if (-not (Install-Tool -ToolName "node=22.16.0")) {
    $installationSuccess = $false
    $failedTools += "Node.js"
}

Write-Log "" "INFO"

# Install UV v0.7.11
if (-not (Install-Tool -ToolName "uv=0.7.11")) {
    $installationSuccess = $false
    $failedTools += "UV"
}

Write-Log "" "INFO"

# Report installation results
Write-Log "========================================" "INFO"
if ($installationSuccess) {
    Write-Log "Installation Complete - All tools installed successfully!" "SUCCESS"
} else {
    Write-Log "Installation Complete - Some tools failed to install!" "WARNING"
    Write-Log "Failed tools: $($failedTools -join ', ')" "ERROR"
}
Write-Log "========================================" "INFO"
Write-Log "" "INFO"

# Set permanent environment variables
Write-Log "Setting permanent environment variables..." "INFO"

# Set MSET_HOME environment variable permanently (user environment)
$envSuccess = $true
if (-not (Set-EnvironmentVariable -Name "MSET_HOME" -Value $MsetHome -Target ([EnvironmentVariableTarget]::User))) {
    $envSuccess = $false
}

# Add bin directory to PATH environment variable permanently (user environment)
Write-Log "Adding $BinDir to user PATH environment variable permanently..." "INFO"
if (-not (Add-ToPath -Path $BinDir -Target ([EnvironmentVariableTarget]::User))) {
    $envSuccess = $false
}

if ($envSuccess) {
    Write-Log "Environment variables configured successfully" "SUCCESS"
} else {
    Write-Log "Some environment variable operations failed" "WARNING"
}

Write-Log "" "INFO"
Write-Log "Installation Summary:" "INFO"

if ($installationSuccess) {
    Write-Log "✓ Node.js v22.16.0 - Installed" "SUCCESS"
    Write-Log "✓ UV v0.7.11 - Installed" "SUCCESS"
} else {
    if ("Node.js" -in $failedTools) {
        Write-Log "✗ Node.js v22.16.0 - Failed" "ERROR"
    } else {
        Write-Log "✓ Node.js v22.16.0 - Installed" "SUCCESS"
    }

    if ("UV" -in $failedTools) {
        Write-Log "✗ UV v0.7.11 - Failed" "ERROR"
    } else {
        Write-Log "✓ UV v0.7.11 - Installed" "SUCCESS"
    }
}

Write-Log "" "INFO"

if ($envSuccess) {
    Write-Log "Environment variables have been configured." "INFO"
    Write-Log "Please restart your command prompt to use the new tools." "INFO"
} else {
    Write-Log "Some environment variable configurations failed." "WARNING"
    Write-Log "You may need to manually configure MSET_HOME and PATH." "WARNING"
}

Write-Log "" "INFO"

# Exit with appropriate code (based on tool installation only)
if ($installationSuccess) {
    Write-Log "Script completed successfully!" "SUCCESS"
    exit 0
} else {
    Write-Log "Script completed with some issues. Check the log above for details." "WARNING"
    exit 1
}