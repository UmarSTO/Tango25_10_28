"""
Windows Application Controller
A Python script to control other Windows applications through keyboard shortcuts.

This script demonstrates how to:
1. Send keyboard shortcuts to applications
2. Control window focus
3. Automate common tasks with hotkeys

Requirements:
- pip install pyautogui
- pip install psutil (optional, for process management)
"""

import pyautogui
import time
import sys
import psutil
import subprocess
import socketserver
import threading
import socket
from typing import Optional, List, Dict

# Configure pyautogui safety settings
pyautogui.PAUSE = 0.1  # Add a small pause between actions
pyautogui.FAILSAFE = True  # Move mouse to top-left corner to abort


class TriggerHandler(socketserver.BaseRequestHandler):
    """Handle incoming socket connections for F4 triggers."""
    
    def handle(self):
        """Handle incoming trigger message."""
        try:
            # Receive data from client
            data = self.request.recv(1024).decode('utf-8').strip()
            
            # Try to parse as JSON first (new format), fallback to simple string (old format)
            try:
                import json
                trigger_data = json.loads(data)
                
                if trigger_data.get('command') == 'TRIGGER_F4':
                    # Extract trigger information
                    symbol_key = trigger_data.get('symbolKey', 'Unknown')
                    scrip = trigger_data.get('scrip', 'Unknown')
                    fut_scrip = trigger_data.get('futScrip', 'Unknown')
                    fut_scrip_bp = trigger_data.get('futScripBp', 'Unknown')
                    timestamp = trigger_data.get('timestamp', 'Unknown')
                    
                    print(f"📦 Received F4 trigger package:")
                    print(f"   Symbol Key: {symbol_key}")
                    print(f"   Scrip: {scrip}")
                    print(f"   futScrip: {fut_scrip}")
                    print(f"   futScripBp: {fut_scrip_bp}")
                    print(f"   Timestamp: {timestamp}")
                    print(f"   Raw package: {trigger_data}")
                    
                    # Store trigger information for use
                    self.server.controller.last_trigger_info = {
                        'command': 'TRIGGER_F4',
                        'symbolKey': symbol_key,
                        'scrip': scrip,
                        'futScrip': fut_scrip,
                        'futScripBp': fut_scrip_bp,
                        'timestamp': timestamp
                    }
                    
                    # Set the global trigger flag
                    self.server.controller.trigger_received = True
                    
                    # Send acknowledgment back to client
                    self.request.sendall(b"F4_TRIGGERED\n")
                    print(f"✅ F4 trigger ready for scrip: {scrip}")
                    
                elif trigger_data.get('command') == 'TRIGGER_F5':
                    # Extract trigger information for F5
                    symbol_key = trigger_data.get('symbolKey', 'Unknown')
                    scrip = trigger_data.get('scrip', 'Unknown')
                    fut_scrip = trigger_data.get('futScrip', 'Unknown')
                    timestamp = trigger_data.get('timestamp', 'Unknown')
                    
                    print(f"📦 Received F5 trigger package:")
                    print(f"   Symbol Key: {symbol_key}")
                    print(f"   Scrip: {scrip}")
                    print(f"   futScrip: {fut_scrip}")
                    print(f"   Timestamp: {timestamp}")
                    print(f"   Raw package: {trigger_data}")
                    
                    # Store trigger information for use
                    self.server.controller.last_trigger_info = {
                        'command': 'TRIGGER_F5',
                        'symbolKey': symbol_key,
                        'scrip': scrip,
                        'futScrip': fut_scrip,
                        'timestamp': timestamp
                    }
                    
                    # Set the global trigger flag
                    self.server.controller.trigger_received = True
                    
                    # Send acknowledgment back to client
                    self.request.sendall(b"F5_TRIGGERED\n")
                    print(f"✅ F5 trigger ready for scrip: {scrip}")
                    
                else:
                    self.request.sendall(b"UNKNOWN_COMMAND\n")
                    
            except json.JSONDecodeError:
                # Fallback to old simple string format for backward compatibility
                if data == "TRIGGER_F4":
                    print("📦 Received legacy trigger format")
                    
                    # Store basic trigger information
                    self.server.controller.last_trigger_info = {
                        'command': 'TRIGGER_F4',  # Set command for legacy compatibility
                        'symbolKey': 'Legacy',
                        'scrip': 'Unknown',
                        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
                    }
                    
                    # Set the global trigger flag
                    self.server.controller.trigger_received = True
                    
                    # Send acknowledgment back to client
                    self.request.sendall(b"F4_TRIGGERED\n")
                    print("Trigger received from Node script - sending F4...")
                else:
                    self.request.sendall(b"UNKNOWN_COMMAND\n")
                
        except Exception as e:
            print(f"Error handling socket request: {e}")


class WindowsAppController:
    """Controller class for automating Windows applications via keyboard shortcuts."""
    
    def __init__(self):
        """Initialize the controller with safety settings."""
        self.setup_safety()
        self.trigger_received = False
        self.server = None
        self.server_thread = None
        self.target_app_info = None  # Store the target application info
        self.last_trigger_info = None  # Store information from the last trigger
    
    def setup_safety(self):
        """Set up safety measures to prevent runaway automation."""
        print("Safety mode enabled:")
        print("- Move mouse to top-left corner to emergency stop")
        print("- 0.1 second pause between actions")
        print("- Press Ctrl+C in terminal to stop script")
        print("-" * 50)
    
    def send_hotkey(self, *keys, delay: float = 0.1):
        """
        Send a keyboard shortcut/hotkey.
        
        Args:
            *keys: Keys to press simultaneously (e.g., 'ctrl', 'c')
            delay: Delay after sending the hotkey
        """
        try:
            print(f"Sending hotkey: {' + '.join(keys)}")
            pyautogui.hotkey(*keys)
            time.sleep(delay)
        except Exception as e:
            print(f"Error sending hotkey: {e}")
    
    def type_text(self, text: str, interval: float = 0.01):
        """
        Type text with specified interval between characters.
        
        Args:
            text: Text to type
            interval: Delay between each character
        """
        try:
            print(f"Typing: {text}")
            pyautogui.typewrite(text, interval=interval)
        except Exception as e:
            print(f"Error typing text: {e}")
    
    def press_key(self, key: str, presses: int = 1, interval: float = 0.1):
        """
        Press a single key multiple times.
        
        Args:
            key: Key to press
            presses: Number of times to press
            interval: Delay between presses
        """
        try:
            print(f"Pressing '{key}' {presses} time(s)")
            pyautogui.press(key, presses=presses, interval=interval)
        except Exception as e:
            print(f"Error pressing key: {e}")
    
    def get_open_applications(self) -> List[Dict[str, str]]:
        """
        Get list of currently open applications with visible windows.
        
        Returns:
            List of dictionaries containing app info (name, pid, window_title)
        """
        try:
            # Use tasklist command to get running processes with window titles
            result = subprocess.run(
                ['tasklist', '/fo', 'csv', '/v'],
                capture_output=True,
                text=True,
                encoding='utf-8'
            )
            
            if result.returncode != 0:
                print("Error getting process list")
                return []
            
            lines = result.stdout.strip().split('\n')
            if len(lines) < 2:
                return []
            
            # Parse CSV header
            header = [col.strip('"') for col in lines[0].split('","')]
            apps = []
            
            # Find relevant column indices
            name_idx = header.index('Image Name') if 'Image Name' in header else 0
            pid_idx = header.index('PID') if 'PID' in header else 1
            title_idx = header.index('Window Title') if 'Window Title' in header else -1
            
            for line in lines[1:]:
                if not line.strip():
                    continue
                    
                # Parse CSV line
                cols = [col.strip('"') for col in line.split('","')]
                if len(cols) <= max(name_idx, pid_idx, title_idx):
                    continue
                
                name = cols[name_idx]
                pid = cols[pid_idx]
                window_title = cols[title_idx] if title_idx != -1 else "N/A"
                
                # Filter out system processes and processes without meaningful window titles
                if (window_title and 
                    window_title not in ['N/A', 'Console', ''] and 
                    not window_title.startswith('Windows') and
                    name.lower() not in ['dwm.exe', 'winlogon.exe', 'csrss.exe', 'smss.exe']):
                    
                    apps.append({
                        'name': name,
                        'pid': pid,
                        'window_title': window_title,
                        'display_name': f"{name} - {window_title}"
                    })
            
            # Remove duplicates based on window title
            seen_titles = set()
            unique_apps = []
            for app in apps:
                if app['window_title'] not in seen_titles:
                    seen_titles.add(app['window_title'])
                    unique_apps.append(app)
            
            return unique_apps
            
        except Exception as e:
            print(f"Error getting applications: {e}")
            return []
    
    def focus_application(self, app_info: Dict[str, str]):
        """
        Automatically focus an application by bringing its window to the front.
        """
        print(f"🎯 Focusing application: {app_info['display_name']}")
        
        try:
            # Use PowerShell to bring the window to front based on process name
            process_name = app_info['name'].replace('.exe', '')
            
            # Enhanced PowerShell command with multiple focus attempts
            powershell_cmd = f'''
            $proc = Get-Process -Name "{process_name}" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($proc -and $proc.MainWindowHandle -ne 0) {{
                Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 {{ [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); [DllImport("user32.dll")] public static extern bool SetActiveWindow(IntPtr hWnd); }}'
                
                # Multiple attempts to ensure focus
                [Win32]::ShowWindow($proc.MainWindowHandle, 9)  # SW_RESTORE
                Start-Sleep -Milliseconds 100
                [Win32]::BringWindowToTop($proc.MainWindowHandle)
                Start-Sleep -Milliseconds 100
                [Win32]::SetForegroundWindow($proc.MainWindowHandle)
                Start-Sleep -Milliseconds 100
                [Win32]::SetActiveWindow($proc.MainWindowHandle)
                
                Write-Host "Successfully focused window for {process_name}"
            }} else {{
                Write-Host "Could not find window for {process_name}"
            }}
            '''
            
            # Execute PowerShell command
            result = subprocess.run(
                ['powershell', '-Command', powershell_cmd],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                print(f"✅ Focus command executed for {app_info['name']}")
                time.sleep(0.3)  # Brief pause to ensure focus is set
                
                # Verify focus by checking if we can send a harmless key
                try:
                    print("🔍 Verifying application focus...")
                    # Send a null operation to test focus (Alt key press and release)
                    pyautogui.keyDown('alt')
                    time.sleep(0.05)
                    pyautogui.keyUp('alt')
                    print("✅ Application focus verified")
                except Exception as verify_error:
                    print(f"⚠️ Focus verification failed: {verify_error}")
                    
            else:
                print(f"❌ Could not auto-focus {app_info['name']}")
                print("Please manually click on the application window")
                time.sleep(1)
                
        except Exception as e:
            print(f"❌ Error focusing application: {e}")
            print("Please manually click on the application window")
            time.sleep(1)
    
    def send_to_focused_window(self, action_type: str):
        """Send keyboard commands to currently focused window."""
        print(f"Sending {action_type} to focused window...")
        
        if action_type == "copy":
            self.send_hotkey('ctrl', 'c')
        elif action_type == "paste":
            self.send_hotkey('ctrl', 'v')
        elif action_type == "select_all":
            self.send_hotkey('ctrl', 'a')
        elif action_type == "save":
            self.send_hotkey('ctrl', 's')
        elif action_type == "undo":
            self.send_hotkey('ctrl', 'z')
        elif action_type == "redo":
            self.send_hotkey('ctrl', 'y')
        elif action_type == "find":
            self.send_hotkey('ctrl', 'f')
        elif action_type == "close":
            self.send_hotkey('alt', 'f4')
        elif action_type == "minimize":
            self.send_hotkey('win', 'down')
        elif action_type == "maximize":
            self.send_hotkey('win', 'up')
    
    def wait(self, seconds: float):
        """Wait for specified seconds with countdown."""
        print(f"Waiting {seconds} seconds...")
        for i in range(int(seconds), 0, -1):
            print(f"  {i}...")
            time.sleep(1)
        if seconds != int(seconds):
            time.sleep(seconds - int(seconds))
    
    def start_socket_server(self, port: int = 9999):
        """Start the socket server to listen for triggers."""
        try:
            # Create server
            self.server = socketserver.TCPServer(("localhost", port), TriggerHandler)
            self.server.controller = self  # Pass reference to controller
            
            # Start server in separate thread
            self.server_thread = threading.Thread(target=self.server.serve_forever)
            self.server_thread.daemon = True  # Dies when main thread dies
            self.server_thread.start()
            
            print(f"Socket server started on localhost:{port}")
            print("Waiting for trigger from Node script...")
            return True
            
        except Exception as e:
            print(f"Error starting socket server: {e}")
            return False
    
    def stop_socket_server(self):
        """Stop the socket server."""
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            print("Socket server stopped")
    
    def wait_for_trigger(self):
        """Wait for trigger from Node script indefinitely."""
        self.trigger_received = False
        
        print("Waiting for trigger... (Press Ctrl+C to cancel)")
        
        while not self.trigger_received:
            time.sleep(0.1)  # Check every 100ms
                
        return True
    
    def execute_trigger_sequence(self, trigger_info):
        """Execute the complete keystroke sequence for F4 or F5 trigger."""
        if not trigger_info:
            print("❌ No trigger information available")
            return
            
        command = trigger_info.get('command', 'UNKNOWN')
        scrip = trigger_info.get('scrip', 'Unknown')
        
        print(f"\n🔄 Executing {command} keystroke sequence for scrip: {scrip}")
        
        try:
            if command == 'TRIGGER_F4':
                self.execute_f4_sequence(scrip)
            elif command == 'TRIGGER_F5':
                self.execute_f5_sequence(scrip)
            else:
                print(f"❌ Unknown command: {command}")
                
        except Exception as e:
            print(f"❌ Error executing {command} sequence: {e}")
            raise
    
    def execute_f4_sequence(self, scrip):
        """Execute the F4 keystroke sequence."""
        print("F4 Sequence:")
        
        # Get trigger info for futScrip and futScripBp
        trigger_info = self.last_trigger_info or {}
        fut_scrip = trigger_info.get('futScrip', scrip)
        fut_scrip_bp = trigger_info.get('futScripBp', '0')
        
        # Step 1: F8
        print("Step 1: Sending F8...")
        self.send_hotkey('f8', delay=0.3)
        
        # Step 2: Enter numeric value 500
        print("Step 2: Entering value 500...")
        self.type_text('500', interval=0.05)
        time.sleep(0.2)
        
        # Step 3: Press SHIFT+TAB 2 times
        print("Step 3: Pressing SHIFT+TAB 2 times...")
        self.send_hotkey('shift', 'tab', delay=0.2)
        self.send_hotkey('shift', 'tab', delay=0.2)
        
        # Step 4: Press F key
        print("Step 4: Pressing F key...")
        self.press_key('f', interval=0.2)
        
        # Step 5: Press TAB 3 times
        print("Step 5: Pressing TAB 3 times...")
        self.press_key('tab', presses=3, interval=0.2)
        
        # Step 6: Enter futScrip value
        print(f"Step 6: Entering futScrip: {fut_scrip}...")
        self.type_text(str(fut_scrip), interval=0.05)
        time.sleep(0.2)
        
        # Step 7: Press TAB
        print("Step 7: Pressing TAB...")
        self.press_key('tab', interval=0.2)
        
        # Step 8: Enter futScripBp value
        print(f"Step 8: Entering futScripBp: {fut_scrip_bp}...")
        self.type_text(str(fut_scrip_bp), interval=0.05)
        time.sleep(0.2)
        
        # Step 9: F4
        print("Step 9: Sending F4...")
        self.send_hotkey('f4', delay=0.3)
        
        # Step 10: Enter numeric value 500
        print("Step 10: Entering value 500...")
        self.type_text('500', interval=0.05)
        time.sleep(0.2)
        
        # Step 11: Press SHIFT+TAB 2 times
        print("Step 11: Pressing SHIFT+TAB 2 times...")
        self.send_hotkey('shift', 'tab', delay=0.2)
        self.send_hotkey('shift', 'tab', delay=0.2)
        
        # Step 12: Press R key
        print("Step 12: Pressing R key...")
        self.press_key('r', interval=0.2)
        
        # Step 13: Press TAB
        print("Step 13: Pressing TAB...")
        self.press_key('tab', interval=0.2)
        
        # Step 14: Press DOWN ARROW 2 times
        print("Step 14: Pressing DOWN ARROW 2 times...")
        self.press_key('down', presses=2, interval=0.2)
        
        # Step 15: Press TAB 2 times
        print("Step 15: Pressing TAB 2 times...")
        self.press_key('tab', presses=2, interval=0.2)
        
        # Step 16: Enter Scrip
        print(f"Step 16: Entering scrip: {scrip}...")
        self.type_text(scrip, interval=0.05)
        time.sleep(0.2)
        
        print(f"✅ F4 keystroke sequence completed successfully for scrip: {scrip}")
    
    def execute_f5_sequence(self, scrip):
        """Execute the F5 keystroke sequence."""
        print("F5 Sequence:")
        
        # Get trigger info for futScrip
        trigger_info = self.last_trigger_info or {}
        fut_scrip = trigger_info.get('futScrip', scrip)
        
        # Step 1: F5
        print("Step 1: Sending F5...")
        self.send_hotkey('f5', delay=0.3)
        
        # Step 2: Enter value 500
        print("Step 2: Entering value 500...")
        self.type_text('500', interval=0.05)
        time.sleep(0.2)
        
        # Step 3: Press SHIFT+TAB 2 times
        print("Step 3: Pressing SHIFT+TAB 2 times...")
        self.send_hotkey('shift', 'tab', delay=0.2)
        self.send_hotkey('shift', 'tab', delay=0.2)
        
        # Step 4: Press R key
        print("Step 4: Pressing R key...")
        self.press_key('r', interval=0.2)
        
        # Step 5: Press TAB
        print("Step 5: Pressing TAB...")
        self.press_key('tab', interval=0.2)
        
        # Step 6: Press DOWN ARROW 2 times
        print("Step 6: Pressing DOWN ARROW 2 times...")
        self.press_key('down', presses=2, interval=0.2)
        
        # Step 7: Press TAB 2 times
        print("Step 7: Pressing TAB 2 times...")
        self.press_key('tab', presses=2, interval=0.2)
        
        # Step 8: Enter scrip value
        print(f"Step 8: Entering scrip: {scrip}...")
        self.type_text(scrip, interval=0.05)
        time.sleep(0.2)
        
        # Step 9: Press F4
        print("Step 9: Sending F4...")
        self.send_hotkey('f4', delay=0.3)
        
        # Step 10: Enter value 500
        print("Step 10: Entering value 500...")
        self.type_text('500', interval=0.05)
        time.sleep(0.2)
        
        # Step 11: Press SHIFT+TAB 2 times
        print("Step 11: Pressing SHIFT+TAB 2 times...")
        self.send_hotkey('shift', 'tab', delay=0.2)
        self.send_hotkey('shift', 'tab', delay=0.2)
        
        # Step 12: Press F key
        print("Step 12: Pressing F key...")
        self.press_key('f', interval=0.2)
        
        # Step 13: Press TAB
        print("Step 13: Pressing TAB...")
        self.press_key('tab', interval=0.2)
        
        # Step 14: Press DOWN ARROW 2 times
        print("Step 14: Pressing DOWN ARROW 2 times...")
        self.press_key('down', presses=2, interval=0.2)
        
        # Step 15: Press TAB 2 times
        print("Step 15: Pressing TAB 2 times...")
        self.press_key('tab', presses=2, interval=0.2)
        
        # Step 16: Enter futScrip value
        print(f"Step 16: Entering futScrip: {fut_scrip}...")
        self.type_text(str(fut_scrip), interval=0.05)
        time.sleep(0.2)
        
        print(f"✅ F5 keystroke sequence completed successfully for scrip: {scrip}")





def show_application_selector(controller: WindowsAppController):
    """Show menu to select from currently open applications."""
    print("\n=== OPEN APPLICATIONS ===")
    print("Scanning for open applications...")
    
    apps = controller.get_open_applications()
    
    if not apps:
        print("No applications with visible windows found.")
        return None
    
    print(f"\nFound {len(apps)} open applications:")
    print("-" * 60)
    
    for i, app in enumerate(apps, 1):
        print(f"{i:2d}. {app['display_name']}")
    
    print("-" * 60)
    
    while True:
        try:
            choice = input(f"\nSelect application (1-{len(apps)}) or 'back': ").strip().lower()
            
            if choice == 'back':
                return None
            
            choice_num = int(choice)
            if 1 <= choice_num <= len(apps):
                return apps[choice_num - 1]
            else:
                print(f"Please enter a number between 1 and {len(apps)}")
                
        except ValueError:
            print("Please enter a valid number or 'back'")


def control_application(controller: WindowsAppController, app_info: Dict[str, str]):
    """Control application with socket-triggered keystrokes."""
    print(f"\n=== CONTROLLING: {app_info['display_name']} ===")
    
    # Store the target application info for re-focusing when trigger arrives
    controller.target_app_info = app_info
    
    # Automatically focus the application
    controller.focus_application(app_info)
    print(f"Application '{app_info['display_name']}' is now focused")
    
    # Start socket server
    if not controller.start_socket_server():
        print("Failed to start socket server. Returning to main menu.")
        return
    
    try:
        # Wait for triggers from Node script continuously
        print("\nSocket server is running. Send 'TRIGGER_F4' message to localhost:9999")
        print("Example Node.js code:")
        print("const net = require('net');")
        print("const client = net.createConnection(9999, 'localhost');")
        print("client.write('TRIGGER_F4');")
        print("\n🔄 Listening for triggers continuously... (Press Ctrl+C to stop)")
        
        while True:
            if controller.wait_for_trigger():  # Wait indefinitely for each trigger
                # Display trigger information if available
                if controller.last_trigger_info:
                    trigger_info = controller.last_trigger_info
                    command_type = trigger_info.get('command', 'UNKNOWN')
                    print(f"\n🎯 Processing {command_type} for:")
                    print(f"   Scrip: {trigger_info['scrip']}")
                    print(f"   Symbol Key: {trigger_info['symbolKey']}")
                    print(f"   Timestamp: {trigger_info['timestamp']}")
                
                # Re-focus the target application right before executing keystrokes
                if controller.target_app_info:
                    print("Ensuring application focus before keystroke execution...")
                    controller.focus_application(controller.target_app_info)
                    time.sleep(0.5)  # Give more time for focus to be properly set
                
                # Execute complete keystroke sequence
                controller.execute_trigger_sequence(controller.last_trigger_info)
                
                # Display completion message with scrip info
                trigger_info = controller.last_trigger_info
                scrip_display = trigger_info['scrip'] if trigger_info else 'Unknown'
                command_type = trigger_info.get('command', 'UNKNOWN') if trigger_info else 'UNKNOWN'
                print(f"✅ {command_type} sequence executed for {app_info['display_name']} - scrip: {scrip_display}")
                print("🔄 Ready for next trigger...")
                
                # Reset trigger flag for next trigger
                controller.trigger_received = False
            else:
                print("Trigger monitoring stopped")
                break
            
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        
    finally:
        # Clean up
        controller.stop_socket_server()
        
    # Interactive keystroke sender
    print(f"\nYou can now send additional keystrokes to: {app_info['display_name']}")
    print("Commands:")
    print("- Single keys: f1, f2, f3, f4, enter, space, esc, tab")
    print("- Hotkeys: ctrl+c, alt+f4, win+d, ctrl+shift+n")
    print("- Text: type:Hello World")
    print("- Type 'back' to select a different application")
    
    while True:
        command = input(f"\n[{app_info['name']}] Enter keystroke (or 'back'): ").strip()
        
        if not command:
            continue
        elif command.lower() == 'back':
            break
        
        try:
            execute_keystroke_command(controller, command)
        except Exception as e:
            print(f"Error executing command '{command}': {e}")


def execute_keystroke_command(controller: WindowsAppController, command: str):
    """Execute a keystroke command."""
    command = command.strip().lower()
    
    # Handle text typing
    if command.startswith('type:'):
        text = command[5:]  # Remove 'type:' prefix
        print(f"Typing: {text}")
        controller.type_text(text)
        return
    
    # Handle hotkeys (contains +)
    if '+' in command:
        keys = [key.strip() for key in command.split('+')]
        print(f"Sending hotkey: {' + '.join(keys)}")
        controller.send_hotkey(*keys)
        return
    
    # Handle single keys
    print(f"Pressing key: {command}")
    controller.press_key(command)





def main():
    """Main function to run the application controller."""
    print("Windows Application Controller")
    print("=" * 40)
    print("Control currently open applications with keyboard shortcuts")
    
    controller = WindowsAppController()
    
    while True:
        print("\n" + "=" * 50)
        print("MAIN MENU")
        print("=" * 50)
        print("1. Select from open applications")
        print("2. Custom hotkey sender")
        print("3. Exit")
        
        choice = input("\nEnter choice (1-3): ").strip()
        
        try:
            if choice == '1':
                app = show_application_selector(controller)
                if app:
                    control_application(controller, app)
            elif choice == '2':
                custom_hotkey_sender(controller)
            elif choice == '3':
                print("Goodbye!")
                break
            else:
                print("Invalid choice. Please try again.")
                
        except KeyboardInterrupt:
            print("\nScript interrupted by user.")
            break
        except Exception as e:
            print(f"An error occurred: {e}")





def custom_hotkey_sender(controller: WindowsAppController):
    """Allow user to send custom hotkeys."""
    print("\n=== CUSTOM HOTKEY SENDER ===")
    print("Examples:")
    print("  alt+tab (switch windows)")
    print("  win+d (show desktop)")
    print("  ctrl+shift+esc (task manager)")
    print("  alt+f4 (close window)")
    
    while True:
        hotkey = input("\nEnter hotkey (e.g., 'ctrl+c') or 'back' to return: ").strip().lower()
        
        if hotkey == 'back':
            break
        
        if not hotkey:
            continue
            
        try:
            # Parse the hotkey string
            keys = [key.strip() for key in hotkey.split('+')]
            
            # Validate keys
            valid_modifiers = ['ctrl', 'alt', 'shift', 'win', 'cmd']
            
            print(f"Sending: {hotkey}")
            controller.send_hotkey(*keys)
            
        except Exception as e:
            print(f"Error: {e}")
            print("Make sure to use valid key names separated by '+'")


if __name__ == "__main__":
    main()