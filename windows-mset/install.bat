@echo off
setlocal

set "BIN_DIR=%~dp0"
REM Remove trailing backslash from BIN_DIR if present
if "%BIN_DIR:~-1%"=="\" set "BIN_DIR=%BIN_DIR:~0,-1%"
echo BIN_DIR : %BIN_DIR%
set "MSET_EXE=%BIN_DIR%\mset.exe"

set "CUSTOM_HOME="

:parse_args
if "%1"=="" goto end_parse
if "%1"=="/home" (
    set "CUSTOM_HOME=%2"
    shift
    shift
    goto parse_args
)
if "%1"=="--home" (
    set "CUSTOM_HOME=%2"
    shift
    shift
    goto parse_args
)
shift
goto parse_args
:end_parse

echo ========================================
echo MSET Auto Install Script
echo ========================================
echo.

echo Installing default versions:
echo - Node.js v22.16.0
echo - UV v0.7.11
echo.



REM Get script directory
set "SCRIPT_DIR=%~dp0"
REM Remove trailing backslash from SCRIPT_DIR if present
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Set MSET_HOME based on command line argument or default to parent directory of bin
if defined CUSTOM_HOME (
    set "MSET_HOME=%CUSTOM_HOME%"
) else (
    for %%i in ("%SCRIPT_DIR%\..") do set "MSET_HOME=%%~fi"
)

echo Setting MSET_HOME=%MSET_HOME%





if not exist "%MSET_EXE%" (
    echo Error: mset.exe not found in the script directory
    echo Please ensure mset.exe is in the same directory as this script: %~dp0
    pause
    exit /b 1
)

echo Installing Node.js v22.16.0...
"%MSET_EXE%" --install node=22.16.0
if errorlevel 1 (
    echo Warning: Node.js installation failed
) else (
    echo Node.js v22.16.0 installed successfully
)
echo.

echo Installing UV v0.7.11...
"%MSET_EXE%" --install uv=0.7.11
if errorlevel 1 (
    echo Warning: UV installation failed
) else (
    echo UV v0.7.11 installed successfully
)
echo.

echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Installed versions:
echo - Node.js v22.16.0
echo - UV v0.7.11
echo.

echo Setting environment variables...

REM Set MSET_HOME environment variable permanently (user environment)
echo Setting MSET_HOME environment variable to %MSET_HOME%
setx MSET_HOME "%MSET_HOME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo Successfully set MSET_HOME environment variable
) else (
    echo Error: Unable to set MSET_HOME environment variable
    echo Error code: %errorlevel%
)

REM Add bin directory to PATH environment variable permanently (user environment)
echo Adding %BIN_DIR% to user PATH environment variable permanently...

REM Get current user PATH using PowerShell to avoid special character issues
for /f "usebackq delims=" %%i in (`powershell -Command "[Environment]::GetEnvironmentVariable('PATH', 'User')"`) do set "USER_PATH=%%i"

REM Initialize USER_PATH as empty string if it's empty
if not defined USER_PATH set "USER_PATH="

REM Check if path already exists using PowerShell
for /f %%i in ('powershell -Command "if ('%USER_PATH%' -like '*%BIN_DIR%*') { 'found' } else { 'notfound' }"') do set "PATH_EXISTS=%%i"

if "%PATH_EXISTS%"=="found" (
    echo Path %BIN_DIR% already exists in user PATH
) else (
    REM Add to user PATH
    if "%USER_PATH%"=="" (
        setx PATH "%BIN_DIR%" >nul 2>&1
    ) else (
        setx PATH "%BIN_DIR%;%USER_PATH%" >nul 2>&1
    )
    if %errorlevel% equ 0 (
        echo Successfully added %BIN_DIR% to user PATH environment variable
    ) else (
        echo Error: Unable to set user PATH environment variable
        echo Error code: %errorlevel%
        echo Note: setx has a 1024 character limit for environment variables
    )
)

REM Set PATH temporarily for current session
set "PATH=%BIN_DIR%;%PATH%"
echo Current session PATH has been updated temporarily

echo.
echo Please restart your command prompt to use the new tools.
echo.
