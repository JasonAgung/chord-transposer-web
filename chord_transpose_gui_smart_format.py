#!/usr/bin/env python3
"""
Chord Chart Transposer GUI with Smart Formatting
A graphical interface for transposing chord charts with auto-alignment features
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import os
import sys
import re

# Handle imports when run from different directories
try:
    from chord_transpose import ChordTransposer, PDFExporter
except ImportError:
    # Add parent directory to path if running from project root
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from chord_transpose import ChordTransposer, PDFExporter

class NumberedChordConverter:
    """Converts chord symbols to numbered notation (Nashville Number System)"""
    
    def __init__(self):
        # Not used anymore, but kept for reference
        self.scale_degrees_old = {
            'C': 1, 'C#': 1, 'Db': 1,
            'D': 2, 'D#': 2, 'Eb': 2,
            'E': 3, 'E#': 4, 'Fb': 3,
            'F': 4, 'F#': 4, 'Gb': 4,
            'G': 5, 'G#': 5, 'Ab': 5,
            'A': 6, 'A#': 6, 'Bb': 6,
            'B': 7, 'B#': 1, 'Cb': 7
        }
        
        # Roman numerals for scale degrees
        self.roman_numerals = {
            1: 'I', 2: 'II', 3: 'III', 4: 'IV', 
            5: 'V', 6: 'VI', 7: 'VII'
        }
        
        # Lowercase for minor chords
        self.roman_numerals_minor = {
            1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 
            5: 'v', 6: 'vi', 7: 'vii'
        }
        
        self.chord_pattern = r'([A-G][#b]?)([mM]?[0-9]*(?:sus|dim|aug|add)?[0-9]*)?(?:/([A-G][#b]?))?'
        
    def get_scale_degree(self, note, key):
        """Get the scale degree of a note relative to the key"""
        # Get chromatic positions
        key_pos = self._get_chromatic_position(key)
        note_pos = self._get_chromatic_position(note)
        
        # Calculate interval
        interval = (note_pos - key_pos) % 12
        
        # Map chromatic intervals to scale degrees in major scale
        # Using the major scale intervals: W-W-H-W-W-W-H
        interval_to_degree = {
            0: (1, ''),    # Unison
            1: (2, 'b'),   # Minor 2nd
            2: (2, ''),    # Major 2nd
            3: (3, 'b'),   # Minor 3rd
            4: (3, ''),    # Major 3rd
            5: (4, ''),    # Perfect 4th
            6: (4, '#'),   # Augmented 4th / Diminished 5th
            7: (5, ''),    # Perfect 5th
            8: (6, 'b'),   # Minor 6th
            9: (6, ''),    # Major 6th
            10: (7, 'b'),  # Minor 7th
            11: (7, '')    # Major 7th
        }
        
        degree, accidental = interval_to_degree.get(interval, (1, ''))
        
        # Special case for F# in key of G (should be VII not #IV)
        if key == 'G' and note == 'F#':
            degree, accidental = 7, ''
            
        return degree, accidental
    
    def _get_chromatic_position(self, note):
        """Get chromatic position (0-11) of a note"""
        positions = {
            'C': 0, 'C#': 1, 'Db': 1,
            'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4, 'E#': 5, 'Fb': 4,
            'F': 5, 'F#': 6, 'Gb': 6,
            'G': 7, 'G#': 8, 'Ab': 8,
            'A': 9, 'A#': 10, 'Bb': 10,
            'B': 11, 'B#': 0, 'Cb': 11
        }
        return positions.get(note, 0)
    
    def convert_chord_to_number(self, chord, key, use_roman=True):
        """Convert a chord symbol to numbered notation"""
        if not chord or not key:
            return chord
            
        # Parse the chord
        match = re.match(self.chord_pattern, chord)
        if not match:
            return chord
            
        root = match.group(1)
        quality = match.group(2) or ''
        bass = match.group(3)
        
        # Get scale degree of root
        degree, accidental = self.get_scale_degree(root, key)
        
        # Determine if chord is minor
        is_minor = False
        if quality:
            if quality == 'm' or (quality.startswith('m') and not quality.startswith('maj')):
                is_minor = True
        
        # Build numbered chord
        if use_roman:
            if is_minor:
                number = self.roman_numerals_minor[degree]
            else:
                number = self.roman_numerals[degree]
            
            # Add accidental if needed
            if accidental:
                number = accidental + number
        else:
            # Use arabic numbers
            number = str(degree)
            if accidental:
                number = accidental + number
            # For arabic, explicitly show minor
            if is_minor and quality not in ['m7', 'm9', 'm11', 'm13']:
                number += 'm'
        
        # Handle quality suffixes
        if quality:
            # Remove 'm' for roman numerals (already indicated by case)
            if use_roman and is_minor and quality.startswith('m'):
                quality = quality[1:]  # Remove the 'm' since it's shown by case
            elif not use_roman and quality == 'm':
                # Already added 'm' above
                quality = ''
            
            # Fix for maj7 appearing as 'i' instead of 'I'
            if quality.startswith('aj7'):
                quality = 'maj7'
                
            number += quality
        
        # Handle slash chords
        if bass:
            bass_degree, bass_accidental = self.get_scale_degree(bass, key)
            if use_roman:
                bass_number = self.roman_numerals[bass_degree]
                if bass_accidental:
                    bass_number = bass_accidental + bass_number
            else:
                bass_number = str(bass_degree)
                if bass_accidental:
                    bass_number = bass_accidental + bass_number
            
            number += '/' + bass_number
        
        return number
    
    def convert_line_to_numbers(self, line, key, use_roman=True):
        """Convert all chords in a line to numbered notation"""
        if not self.is_chord_line(line):
            return line
            
        # Replace each chord with its numbered equivalent
        def replace_chord(match):
            chord = match.group(0)
            return self.convert_chord_to_number(chord, key, use_roman)
        
        return re.sub(self.chord_pattern + r'(?![#b])', replace_chord, line)
    
    def is_chord_line(self, line):
        """Check if a line contains chord progressions"""
        # Similar to SmartFormatter's method
        has_bars = '|' in line
        has_chords = bool(re.search(self.chord_pattern, line))
        symbol_ratio = sum(1 for c in line if c in '|.-') / max(len(line), 1)
        return has_bars and has_chords and symbol_ratio > 0.1
    
    def convert_chart_to_numbers(self, content, use_roman=True):
        """Convert entire chart to numbered notation"""
        # Extract key from content
        key_match = re.search(r'Do\s*=\s*([A-G][#b]?)', content)
        if not key_match:
            return content  # No key found, return original
            
        key = key_match.group(1)
        
        lines = content.split('\n')
        converted_lines = []
        
        for line in lines:
            if self.is_chord_line(line):
                converted_line = self.convert_line_to_numbers(line, key, use_roman)
                converted_lines.append(converted_line)
            else:
                converted_lines.append(line)
        
        return '\n'.join(converted_lines)

class SmartFormatter:
    """Handles smart formatting of chord charts"""
    
    def __init__(self):
        self.bar_pattern = r'\|'
        self.chord_pattern = r'([A-G][#b]?)([mM]?[0-9]*(?:sus|dim|aug|add)?[0-9]*)?(?:/([A-G][#b]?))?'
        self.time_signature = None  # Will be detected from content
        
    def format_chart(self, content):
        """Format the entire chart with proper alignment"""
        # First, detect time signature from content
        self.detect_time_signature(content)
        
        lines = content.split('\n')
        formatted_lines = []
        
        # First pass: identify chord lines and measure maximum bar positions
        chord_lines = []
        max_bars = 0
        
        for i, line in enumerate(lines):
            if self.is_chord_line(line):
                bars = line.count('|')
                max_bars = max(max_bars, bars)
                chord_lines.append(i)
        
        # Second pass: format each line
        for i, line in enumerate(lines):
            if i in chord_lines:
                formatted_line = self.format_chord_line(line)
                formatted_lines.append(formatted_line)
            else:
                formatted_lines.append(line)
        
        return '\n'.join(formatted_lines)
    
    def detect_time_signature(self, content):
        """Detect time signature from the content"""
        # Look for explicit time signature declaration
        time_sig_match = re.search(r'Time Signature\s*=\s*(\d+)/(\d+)', content, re.IGNORECASE)
        
        if time_sig_match:
            numerator = int(time_sig_match.group(1))
            denominator = int(time_sig_match.group(2))
            self.time_signature = (numerator, denominator)
        else:
            # Default to 4/4 if not specified
            self.time_signature = (4, 4)
    
    def is_chord_line(self, line):
        """Check if a line contains chord progressions"""
        # A chord line typically has bars and chords
        has_bars = '|' in line
        has_chords = bool(re.search(self.chord_pattern, line))
        
        # Check if it's not a lyric line (usually chord lines have more symbols)
        symbol_ratio = sum(1 for c in line if c in '|.-') / max(len(line), 1)
        
        return has_bars and has_chords and symbol_ratio > 0.1
    
    def format_chord_line(self, line):
        """Format a single chord line with proper spacing"""
        if not line.strip():
            return line
        
        # Split by bars while keeping the bars
        parts = re.split(r'(\|)', line)
        
        # Process each bar section
        formatted_parts = []
        current_bar_content = []
        
        for part in parts:
            if part == '|':
                # Process the accumulated bar content
                if current_bar_content:
                    formatted_bar = self.format_bar_content(''.join(current_bar_content))
                    formatted_parts.append(formatted_bar)
                    current_bar_content = []
                formatted_parts.append('|')
            else:
                current_bar_content.append(part)
        
        # Don't forget the last part if it exists
        if current_bar_content:
            formatted_bar = self.format_bar_content(''.join(current_bar_content))
            formatted_parts.append(formatted_bar)
        
        # Join and clean up
        result = ''.join(formatted_parts)
        
        # Ensure consistent spacing between bars but not after opening
        parts = result.split('|')
        cleaned_parts = []
        
        for i, part in enumerate(parts):
            part = part.strip()
            if i == 0 and not part:  # Leading bar
                continue
            elif i == len(parts) - 1 and not part:  # Trailing bar
                continue
            else:
                cleaned_parts.append(part)
        
        # Reconstruct with proper spacing
        if line.strip().startswith('|'):
            # Check if we need a trailing bar
            if line.strip().endswith('|'):
                result = '|' + ' | '.join(cleaned_parts) + '|'
            else:
                result = '|' + ' | '.join(cleaned_parts)
        else:
            result = ' | '.join(cleaned_parts)
        
        return result
    
    def format_bar_content(self, content):
        """Format the content within a bar"""
        content = content.strip()
        if not content:
            return ''  # Return empty string for empty bar
        
        # Split the content into tokens (chords and dots)
        tokens = content.split()
        if not tokens:
            return content
        
        # Process each token
        formatted_tokens = []
        for token in tokens:
            # Keep dots as-is
            if token == '.':
                formatted_tokens.append(token)
            # Check if it's a chord
            elif re.match(self.chord_pattern + r'$', token):
                formatted_tokens.append(token)
            else:
                # Unknown token, keep as-is
                formatted_tokens.append(token)
        
        # Join tokens with single spaces
        return ' '.join(formatted_tokens)
    
    def align_bars_in_section(self, lines):
        """Align bars across multiple lines in a section"""
        if not lines:
            return lines
        
        # Process lines for alignment
        
        # Parse each line into bars
        parsed_lines = []
        for line in lines:
            # Remove leading/trailing whitespace but keep internal structure
            line = line.strip()
            bars = []
            
            if line.startswith('|') and line.endswith('|'):
                # Split by | and filter out empty parts
                parts = line.split('|')
                # Skip first empty part and last empty part
                for i in range(1, len(parts) - 1):
                    if parts[i] or parts[i] == ' ':  # Keep even single space bars
                        bars.append(parts[i].strip())
            else:
                # Handle malformed lines
                bars = [line]
            
            # Continue to next line
            parsed_lines.append(bars)
        
        # Find the maximum number of bars
        max_bars = max(len(bars) for bars in parsed_lines) if parsed_lines else 0
        # Process bar tokens
        
        # Parse each bar into tokens for beat alignment
        parsed_bar_tokens = []
        for bars in parsed_lines:
            line_bar_tokens = []
            for bar in bars:
                if bar:
                    tokens = bar.split()
                    line_bar_tokens.append(tokens)
                else:
                    line_bar_tokens.append([])
            parsed_bar_tokens.append(line_bar_tokens)
        
        # For each bar position, find max tokens and token widths
        bar_token_info = []
        bar_total_widths = []  # Track total width needed for each bar position
        
        for bar_idx in range(max_bars):
            # Find max number of tokens in this bar position
            max_tokens = 0
            for line_tokens in parsed_bar_tokens:
                if bar_idx < len(line_tokens):
                    max_tokens = max(max_tokens, len(line_tokens[bar_idx]))
            
            # Find max width for each token position in this bar
            token_widths = []
            for token_idx in range(max_tokens):
                max_width = 0
                for line_tokens in parsed_bar_tokens:
                    if bar_idx < len(line_tokens) and token_idx < len(line_tokens[bar_idx]):
                        token = line_tokens[bar_idx][token_idx]
                        max_width = max(max_width, len(token))
                token_widths.append(max_width)
            
            # Calculate total width needed for this bar (sum of token widths + spaces)
            total_width = sum(token_widths) + max(0, len(token_widths) - 1)  # tokens + spaces between
            bar_total_widths.append(total_width)
            
            bar_token_info.append((max_tokens, token_widths))
        
        # Reconstruct lines with aligned bars and beats
        aligned_lines = []
        for line_idx, line_tokens in enumerate(parsed_bar_tokens):
            line_parts = ['|']  # Start with opening bar
            
            # Process all bars up to max_bars to ensure alignment
            for bar_idx in range(max_bars):
                if bar_idx < len(line_tokens):
                    bar_tokens = line_tokens[bar_idx]
                    
                    if bar_idx < len(bar_token_info):
                        max_tokens, token_widths = bar_token_info[bar_idx]
                        total_width = bar_total_widths[bar_idx]
                        
                        # Align tokens within this bar
                        aligned_tokens = []
                        for token_idx, token in enumerate(bar_tokens):
                            if token_idx < len(token_widths):
                                aligned_tokens.append(token.ljust(token_widths[token_idx]))
                            else:
                                aligned_tokens.append(token)
                        
                        # Pad with spaces if this bar has fewer tokens
                        while len(aligned_tokens) < max_tokens:
                            if len(aligned_tokens) < len(token_widths):
                                aligned_tokens.append(' ' * token_widths[len(aligned_tokens)])
                            else:
                                aligned_tokens.append(' ')
                        
                        # Join tokens and pad to total width
                        bar_content = ' '.join(aligned_tokens)
                        bar_content = bar_content.ljust(total_width)
                    else:
                        # Fallback: just join tokens
                        bar_content = ' '.join(bar_tokens)
                else:
                    # This line has fewer bars - skip this position
                    break
                
                line_parts.append(bar_content + ' |')
            
            aligned_line = ''.join(line_parts)
            aligned_lines.append(aligned_line)
        
        # Return aligned lines
        
        return aligned_lines

class ChordTransposerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Chord Chart Transposer - Smart Format")
        self.root.geometry("1000x700")
        
        # Initialize transposer, formatter, and number converter
        self.transposer = ChordTransposer()
        self.formatter = SmartFormatter()
        self.number_converter = NumberedChordConverter()
        self.current_key = None
        
        # Create menu bar
        self.create_menu()
        
        # Create main frame
        main_frame = ttk.Frame(root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights
        root.columnconfigure(0, weight=1)
        root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(2, weight=1)
        
        # File controls
        file_frame = ttk.LabelFrame(main_frame, text="File", padding="10")
        file_frame.grid(row=0, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Button(file_frame, text="Open File", command=self.open_file).pack(side=tk.LEFT, padx=5)
        ttk.Button(file_frame, text="Save As...", command=self.save_file).pack(side=tk.LEFT, padx=5)
        
        self.filename_label = ttk.Label(file_frame, text="No file loaded")
        self.filename_label.pack(side=tk.LEFT, padx=20)
        
        # Transposition controls
        transpose_frame = ttk.LabelFrame(main_frame, text="Transpose", padding="10")
        transpose_frame.grid(row=1, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=5)
        
        # Current key display
        ttk.Label(transpose_frame, text="Current Key:").pack(side=tk.LEFT, padx=5)
        self.current_key_label = ttk.Label(transpose_frame, text="--", font=('Arial', 12, 'bold'))
        self.current_key_label.pack(side=tk.LEFT, padx=5)
        
        ttk.Label(transpose_frame, text="→").pack(side=tk.LEFT, padx=10)
        
        # Target key selection
        ttk.Label(transpose_frame, text="Target Key:").pack(side=tk.LEFT, padx=5)
        self.target_key_var = tk.StringVar()
        key_combo = ttk.Combobox(transpose_frame, textvariable=self.target_key_var, width=10)
        key_combo['values'] = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']
        key_combo.pack(side=tk.LEFT, padx=5)
        
        ttk.Button(transpose_frame, text="Transpose", command=self.transpose_chart).pack(side=tk.LEFT, padx=20)
        
        # Format button
        ttk.Button(transpose_frame, text="Smart Format", command=self.smart_format).pack(side=tk.LEFT, padx=10)
        
        # Quick transpose buttons
        ttk.Label(transpose_frame, text="Quick:").pack(side=tk.LEFT, padx=10)
        ttk.Button(transpose_frame, text="+1", command=lambda: self.quick_transpose(1)).pack(side=tk.LEFT, padx=2)
        ttk.Button(transpose_frame, text="-1", command=lambda: self.quick_transpose(-1)).pack(side=tk.LEFT, padx=2)
        ttk.Button(transpose_frame, text="+½", command=lambda: self.transpose_half_step(1)).pack(side=tk.LEFT, padx=2)
        ttk.Button(transpose_frame, text="-½", command=lambda: self.transpose_half_step(-1)).pack(side=tk.LEFT, padx=2)
        
        # Number system controls
        number_frame = ttk.LabelFrame(main_frame, text="Number System", padding="10")
        number_frame.grid(row=1, column=3, sticky=(tk.W, tk.E, tk.N), pady=5, padx=5)
        
        # Number style selection
        self.number_style_var = tk.StringVar(value="roman")
        ttk.Radiobutton(number_frame, text="Roman (I, ii, iii)", variable=self.number_style_var, value="roman").pack(anchor=tk.W)
        ttk.Radiobutton(number_frame, text="Arabic (1, 2m, 3m)", variable=self.number_style_var, value="arabic").pack(anchor=tk.W)
        
        # Convert buttons
        ttk.Button(number_frame, text="Convert to Numbers", command=self.convert_to_numbers).pack(pady=5, fill=tk.X)
        ttk.Button(number_frame, text="Convert Back", command=self.convert_from_numbers).pack(pady=2, fill=tk.X)
        
        # Text areas
        # Original text
        original_frame = ttk.LabelFrame(main_frame, text="Original", padding="5")
        original_frame.grid(row=2, column=0, sticky=(tk.W, tk.E, tk.N, tk.S), padx=5, pady=5)
        
        self.original_text = scrolledtext.ScrolledText(original_frame, width=40, height=25, wrap=tk.NONE, font=('Courier', 10))
        self.original_text.pack(fill=tk.BOTH, expand=True)
        
        # Add horizontal scrollbar to original text
        h_scroll_orig = ttk.Scrollbar(original_frame, orient=tk.HORIZONTAL, command=self.original_text.xview)
        h_scroll_orig.pack(side=tk.BOTTOM, fill=tk.X)
        self.original_text.config(xscrollcommand=h_scroll_orig.set)
        
        # Transposed text
        transposed_frame = ttk.LabelFrame(main_frame, text="Transposed", padding="5")
        transposed_frame.grid(row=2, column=1, sticky=(tk.W, tk.E, tk.N, tk.S), padx=5, pady=5)
        
        self.transposed_text = scrolledtext.ScrolledText(transposed_frame, width=40, height=25, wrap=tk.NONE, font=('Courier', 10))
        self.transposed_text.pack(fill=tk.BOTH, expand=True)
        
        # Add horizontal scrollbar to transposed text
        h_scroll_trans = ttk.Scrollbar(transposed_frame, orient=tk.HORIZONTAL, command=self.transposed_text.xview)
        h_scroll_trans.pack(side=tk.BOTTOM, fill=tk.X)
        self.transposed_text.config(xscrollcommand=h_scroll_trans.set)
        
        # Configure grid weights for text areas
        main_frame.columnconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        
        # Status bar
        self.status_var = tk.StringVar()
        self.status_var.set("Ready")
        status_bar = ttk.Label(main_frame, textvariable=self.status_var, relief=tk.SUNKEN)
        status_bar.grid(row=3, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=5)
        
        # Bind events
        # Removed Modified event binding to prevent interference with formatting
        
    def create_menu(self):
        """Create menu bar"""
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)
        
        # File menu
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="Open...", command=self.open_file, accelerator="Ctrl+O")
        file_menu.add_command(label="Save As...", command=self.save_file, accelerator="Ctrl+S")
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.root.quit)
        
        # Edit menu
        edit_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Edit", menu=edit_menu)
        edit_menu.add_command(label="Copy Transposed", command=self.copy_transposed)
        edit_menu.add_command(label="Clear All", command=self.clear_all)
        edit_menu.add_separator()
        edit_menu.add_command(label="Smart Format", command=self.smart_format)
        edit_menu.add_command(label="Format Original", command=self.format_original)
        edit_menu.add_command(label="Format Transposed", command=self.format_transposed)
        
        # Tools menu
        tools_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Tools", menu=tools_menu)
        
        # Template submenu
        template_menu = tk.Menu(tools_menu, tearoff=0)
        tools_menu.add_cascade(label="Load Template", menu=template_menu)
        template_menu.add_command(label="Generic Template", command=self.load_template)
        template_menu.add_command(label="3/4 Time Template", command=self.load_template_3_4)
        template_menu.add_command(label="4/4 Time Template", command=self.load_template_4_4)
        
        tools_menu.add_command(label="Detect Key", command=self.detect_key)
        tools_menu.add_command(label="Align All Sections", command=self.align_all_sections)
        tools_menu.add_separator()
        
        # Number system submenu
        number_menu = tk.Menu(tools_menu, tearoff=0)
        tools_menu.add_cascade(label="Number System", menu=number_menu)
        number_menu.add_command(label="Convert to Roman Numerals", command=lambda: self.convert_to_numbers_style("roman"))
        number_menu.add_command(label="Convert to Arabic Numbers", command=lambda: self.convert_to_numbers_style("arabic"))
        
        # Help menu
        help_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Help", menu=help_menu)
        help_menu.add_command(label="Chord Notation Guide", command=self.show_chord_guide)
        help_menu.add_command(label="Smart Format Guide", command=self.show_format_guide)
        help_menu.add_command(label="About", command=self.show_about)
        
        # Bind keyboard shortcuts
        self.root.bind('<Control-o>', lambda e: self.open_file())
        self.root.bind('<Control-s>', lambda e: self.save_file())
        self.root.bind('<Control-f>', lambda e: self.smart_format())
    
    def format_and_align_content(self, content):
        """Format and align content - used by smart format button and save dialog"""
        if not content:
            return content
        
        # Detect time signature
        self.formatter.detect_time_signature(content)
        
        # Format the chart
        formatted = self.formatter.format_chart(content)
        lines = formatted.split('\n')
        
        print("DEBUG: After format_chart:")
        for i, line in enumerate(lines):
            if self.formatter.is_chord_line(line):
                print(f"  Line {i}: {repr(line)}")
        
        # Group consecutive chord lines and align them within sections
        sections = []
        current_section = []
        
        for line in lines:
            if self.formatter.is_chord_line(line):
                current_section.append(line)
            else:
                if current_section:
                    print(f"\nDEBUG: Aligning section with {len(current_section)} lines:")
                    for l in current_section:
                        print(f"  Before: {repr(l)}")
                    
                    # Align this section
                    aligned = self.formatter.align_bars_in_section(current_section)
                    
                    print("  After alignment:")
                    for l in aligned:
                        print(f"  After:  {repr(l)}")
                    
                    sections.extend(aligned)
                    current_section = []
                sections.append(line)
        
        # Don't forget the last section
        if current_section:
            print(f"\nDEBUG: Aligning final section with {len(current_section)} lines:")
            for l in current_section:
                print(f"  Before: {repr(l)}")
            
            aligned = self.formatter.align_bars_in_section(current_section)
            
            print("  After alignment:")
            for l in aligned:
                print(f"  After:  {repr(l)}")
            
            sections.extend(aligned)
        
        return '\n'.join(sections)
        
    def smart_format(self):
        """Apply smart formatting to both text areas - includes alignment"""
        # Force the text widget to process any pending events
        self.root.update()
        
        # Always detect key from current content first
        self.detect_key()
        
        # Format and align original text
        content = self.original_text.get('1.0', tk.END).rstrip()
        if content:
            # Save original content as backup
            original_backup = content
            
            # Debug: Check for any lines that might have formatting issues
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if '|' in line and line.strip() and not line.strip().endswith('|'):
                    print(f"DEBUG: Line {i+1} might be missing closing bar: {repr(line)}")
            
            formatted_content = self.format_and_align_content(content)
            
            # Sanity check: if formatted content is significantly shorter, something went wrong
            if len(formatted_content) < len(original_backup) * 0.5:
                print(f"WARNING: Formatted content is much shorter than original!")
                print(f"Original: {len(original_backup)} chars, Formatted: {len(formatted_content)} chars")
                response = messagebox.askyesno("Format Warning", 
                    "The formatted content appears to be significantly shorter than the original. " +
                    "This might indicate content loss. Continue anyway?")
                if not response:
                    return
            
            # Store cursor position
            cursor_pos = self.original_text.index("insert")
            self.original_text.delete('1.0', tk.END)
            self.original_text.insert('1.0', formatted_content)
            # Try to restore cursor position
            try:
                self.original_text.mark_set("insert", cursor_pos)
            except:
                pass
        
        # Format and align transposed text if it exists
        transposed_content = self.transposed_text.get('1.0', tk.END).rstrip()
        if transposed_content:
            formatted_content = self.format_and_align_content(transposed_content)
            self.transposed_text.delete('1.0', tk.END)
            self.transposed_text.insert('1.0', formatted_content)
        
        self.status_var.set("Smart formatting and alignment applied!")
    
    def format_original(self):
        """Format the original text"""
        content = self.original_text.get('1.0', tk.END).rstrip()
        if content:
            formatted = self.formatter.format_chart(content)
            self.original_text.delete('1.0', tk.END)
            self.original_text.insert('1.0', formatted)
            self.status_var.set("Original text formatted")
    
    def format_transposed(self):
        """Format the transposed text"""
        content = self.transposed_text.get('1.0', tk.END).rstrip()
        if content:
            formatted = self.formatter.format_chart(content)
            self.transposed_text.delete('1.0', tk.END)
            self.transposed_text.insert('1.0', formatted)
            self.status_var.set("Transposed text formatted")
    
    def align_all_sections(self):
        """Align bars across all sections"""
        # First detect time signature
        content = self.original_text.get('1.0', tk.END).rstrip()
        self.formatter.detect_time_signature(content)
        
        # Work on original text
        if content:
            lines = content.split('\n')
            
            # Group consecutive chord lines
            sections = []
            current_section = []
            
            for line in lines:
                if self.formatter.is_chord_line(line):
                    current_section.append(line)
                else:
                    if current_section:
                        # Align this section
                        aligned = self.formatter.align_bars_in_section(current_section)
                        sections.extend(aligned)
                        current_section = []
                    sections.append(line)
            
            # Don't forget the last section
            if current_section:
                aligned = self.formatter.align_bars_in_section(current_section)
                sections.extend(aligned)
            
            # Update the text
            self.original_text.delete('1.0', tk.END)
            self.original_text.insert('1.0', '\n'.join(sections))
        
        # Also align transposed text if it exists
        transposed_content = self.transposed_text.get('1.0', tk.END).rstrip()
        if transposed_content:
            # Detect time signature from transposed content
            self.formatter.detect_time_signature(transposed_content)
            
            lines = transposed_content.split('\n')
            sections = []
            current_section = []
            
            for line in lines:
                if self.formatter.is_chord_line(line):
                    current_section.append(line)
                else:
                    if current_section:
                        aligned = self.formatter.align_bars_in_section(current_section)
                        sections.extend(aligned)
                        current_section = []
                    sections.append(line)
            
            if current_section:
                aligned = self.formatter.align_bars_in_section(current_section)
                sections.extend(aligned)
            
            self.transposed_text.delete('1.0', tk.END)
            self.transposed_text.insert('1.0', '\n'.join(sections))
        
        self.status_var.set("All sections aligned - bars now line up vertically!")
    
    def open_file(self):
        """Open a chord chart file"""
        filename = filedialog.askopenfilename(
            title="Open Chord Chart",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )
        
        if filename:
            try:
                with open(filename, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                self.original_text.delete('1.0', tk.END)
                self.original_text.insert('1.0', content)
                
                self.filename_label.config(text=os.path.basename(filename))
                self.detect_key()
                self.status_var.set(f"Loaded: {os.path.basename(filename)}")
                
            except Exception as e:
                messagebox.showerror("Error", f"Could not open file: {str(e)}")
    
    def save_file(self):
        """Save the transposed chart with format options"""
        if not self.transposed_text.get('1.0', tk.END).strip():
            messagebox.showwarning("Warning", "No transposed content to save")
            return
        
        # Create custom save dialog
        save_dialog = tk.Toplevel(self.root)
        save_dialog.title("Save Transposed Chart")
        save_dialog.geometry("400x250")
        save_dialog.transient(self.root)
        save_dialog.grab_set()
        
        # Center the dialog
        save_dialog.update_idletasks()
        x = (save_dialog.winfo_screenwidth() - save_dialog.winfo_width()) // 2
        y = (save_dialog.winfo_screenheight() - save_dialog.winfo_height()) // 2
        save_dialog.geometry(f"+{x}+{y}")
        
        # Format selection
        ttk.Label(save_dialog, text="Select format:", font=('Arial', 10)).pack(pady=10)
        
        format_var = tk.StringVar(value="txt")
        format_frame = ttk.Frame(save_dialog)
        format_frame.pack(pady=10)
        
        ttk.Radiobutton(format_frame, text="Text File (.txt)", variable=format_var, value="txt").pack(anchor=tk.W)
        ttk.Radiobutton(format_frame, text="PDF - Portrait", variable=format_var, value="pdf_portrait").pack(anchor=tk.W)
        ttk.Radiobutton(format_frame, text="PDF - Landscape (2 columns)", variable=format_var, value="pdf_landscape").pack(anchor=tk.W)
        
        # Format before save option
        format_before_save = tk.BooleanVar(value=True)
        ttk.Checkbutton(format_frame, text="Apply smart formatting before saving", 
                       variable=format_before_save).pack(anchor=tk.W, pady=10)
        
        def proceed_save():
            save_dialog.destroy()
            format_choice = format_var.get()
            
            # Get content and optionally format it
            content = self.transposed_text.get('1.0', tk.END).rstrip()
            if format_before_save.get():
                content = self.format_and_align_content(content)
            
            if format_choice == "txt":
                filename = filedialog.asksaveasfilename(
                    title="Save as Text",
                    defaultextension=".txt",
                    filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
                )
                if filename:
                    try:
                        with open(filename, 'w', encoding='utf-8') as f:
                            f.write(content + '\n')
                        self.status_var.set(f"Saved: {os.path.basename(filename)}")
                        messagebox.showinfo("Success", "File saved successfully")
                    except Exception as e:
                        messagebox.showerror("Error", f"Could not save file: {str(e)}")
            
            elif format_choice in ["pdf_portrait", "pdf_landscape"]:
                landscape = (format_choice == "pdf_landscape")
                # Pass apply_formatting=False since formatting was already handled above if needed
                self.export_pdf(content, landscape=landscape, apply_formatting=False)
        
        button_frame = ttk.Frame(save_dialog)
        button_frame.pack(pady=20)
        ttk.Button(button_frame, text="Save", command=proceed_save).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancel", command=save_dialog.destroy).pack(side=tk.LEFT, padx=5)
    
    def export_pdf(self, content=None, landscape=False, apply_formatting=None):
        """Export the transposed chart as PDF with proper formatting"""
        if content is None:
            content = self.transposed_text.get('1.0', tk.END).rstrip()
            # If content is None, we're being called directly, so apply formatting by default
            if apply_formatting is None:
                apply_formatting = True
            
        if not content:
            messagebox.showwarning("Warning", "No content to export")
            return
        
        try:
            # Check if PDF support is available
            from reportlab.lib.pagesizes import letter
            
            filename = filedialog.asksaveasfilename(
                title="Export as PDF",
                defaultextension=".pdf",
                filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")]
            )
            
            if filename:
                # Only apply formatting if explicitly requested (when called directly)
                if apply_formatting:
                    content = self.format_and_align_content(content)
                
                pdf_exporter = PDFExporter()
                pdf_exporter.export_to_pdf(content, filename, landscape_mode=landscape)
                
                self.status_var.set(f"Exported PDF: {os.path.basename(filename)}")
                format_msg = "with smart formatting" if apply_formatting else "without formatting"
                messagebox.showinfo("Success", f"PDF exported successfully {format_msg}\n{'(Landscape mode)' if landscape else '(Portrait mode)'}")
                
        except ImportError:
            messagebox.showerror("Error", "PDF export requires reportlab library.\nInstall with: pip install reportlab")
        except Exception as e:
            messagebox.showerror("Error", f"Could not export PDF: {str(e)}")
    
    def detect_key(self):
        """Detect the current key from the content"""
        content = self.original_text.get('1.0', tk.END)
        import re
        key_match = re.search(r'Do\s*=\s*([A-G][#b]?)', content)
        
        if key_match:
            self.current_key = key_match.group(1)
            self.current_key_label.config(text=self.current_key)
            self.status_var.set(f"Detected key: {self.current_key}")
        else:
            self.current_key = None
            self.current_key_label.config(text="--")
            self.status_var.set("No key found (looking for 'Do = X')")
    
    def transpose_chart(self):
        """Transpose the chart to the target key"""
        if not self.current_key:
            messagebox.showwarning("Warning", "No current key detected. Please ensure your chart has 'Do = X'")
            return
        
        target_key = self.target_key_var.get()
        if not target_key:
            messagebox.showwarning("Warning", "Please select a target key")
            return
        
        try:
            content = self.original_text.get('1.0', tk.END).rstrip()
            transposed = self.transposer.transpose_chart(content, self.current_key, target_key)
            
            self.transposed_text.delete('1.0', tk.END)
            self.transposed_text.insert('1.0', transposed)
            
            self.status_var.set(f"Transposed from {self.current_key} to {target_key}")
            
        except Exception as e:
            messagebox.showerror("Error", f"Could not transpose: {str(e)}")
    
    def quick_transpose(self, steps):
        """Quick transpose by whole steps"""
        if not self.current_key:
            self.detect_key()
            if not self.current_key:
                return
        
        # Calculate target key based on the current target key if one exists, otherwise from current key
        try:
            base_key = self.target_key_var.get() if self.target_key_var.get() else self.current_key
            current_index = self.transposer.get_note_index(base_key)
            new_index = (current_index + (steps * 2)) % 12  # 2 semitones = 1 whole step
            
            # Get the target note name
            target_note_sharp = self.transposer.NOTES_SHARP[new_index]
            target_note_flat = self.transposer.NOTES_FLAT[new_index]
            
            # Intelligent selection of sharps vs flats
            if target_note_sharp == target_note_flat:
                # Natural notes (C, D, E, F, G, A, B) - use as is
                target_key = target_note_sharp
            elif steps < 0:
                # When going down, prefer flats
                target_key = target_note_flat
            elif steps > 0:
                # When going up, prefer sharps
                target_key = target_note_sharp
            else:
                # Fallback to checking if we should use flats based on context
                use_flats = self.transposer.should_use_flats(base_key)
                target_key = target_note_flat if use_flats else target_note_sharp
            
            self.target_key_var.set(target_key)
            self.transpose_chart()
            
        except Exception as e:
            messagebox.showerror("Error", f"Could not transpose: {str(e)}")
    
    def transpose_half_step(self, steps):
        """Transpose by half steps (semitones)"""
        if not self.current_key:
            self.detect_key()
            if not self.current_key:
                return
        
        try:
            # Calculate target key based on the current target key if one exists, otherwise from current key
            base_key = self.target_key_var.get() if self.target_key_var.get() else self.current_key
            current_index = self.transposer.get_note_index(base_key)
            new_index = (current_index + steps) % 12
            
            # Get the target note name
            target_note_sharp = self.transposer.NOTES_SHARP[new_index]
            target_note_flat = self.transposer.NOTES_FLAT[new_index]
            
            # Intelligent selection of sharps vs flats
            if target_note_sharp == target_note_flat:
                # Natural notes (C, D, E, F, G, A, B) - use as is
                target_key = target_note_sharp
            elif steps < 0:
                # When going down, prefer flats (e.g., A → Ab, not G#)
                target_key = target_note_flat
            elif steps > 0:
                # When going up, prefer sharps (e.g., G → G#, not Ab)
                target_key = target_note_sharp
            else:
                # Fallback to checking if we should use flats based on context
                use_flats = self.transposer.should_use_flats(base_key)
                target_key = target_note_flat if use_flats else target_note_sharp
            
            self.target_key_var.set(target_key)
            self.transpose_chart()
            
        except Exception as e:
            messagebox.showerror("Error", f"Could not transpose: {str(e)}")
    
    def copy_transposed(self):
        """Copy transposed content to clipboard"""
        content = self.transposed_text.get('1.0', tk.END).rstrip()
        if content:
            self.root.clipboard_clear()
            self.root.clipboard_append(content)
            self.status_var.set("Transposed content copied to clipboard")
        else:
            messagebox.showwarning("Warning", "No transposed content to copy")
    
    def clear_all(self):
        """Clear all text areas"""
        if messagebox.askyesno("Confirm", "Clear all content?"):
            self.original_text.delete('1.0', tk.END)
            self.transposed_text.delete('1.0', tk.END)
            self.current_key = None
            self.current_key_label.config(text="--")
            self.filename_label.config(text="No file loaded")
            self.status_var.set("Cleared")
    
    def load_template(self):
        """Load the chord chart template"""
        template = """[Song Number]. [Song Title] ([Source/Book Reference])
Do = [Key]
Time Signature = [Time Signature]
Tempo (1/4) = [Tempo] BPM
Structure = [Song Structure]

Intro : [Instructions/Instruments]
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |

[Section Name] :
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |

====== INSTRUCTIONS ======
Replace bracketed items with actual values.
Each bar is separated by | symbols.
Use dots (.) to represent beats."""
        
        self.original_text.delete('1.0', tk.END)
        self.original_text.insert('1.0', template)
        self.status_var.set("Template loaded")
    
    def load_template_3_4(self):
        """Load the 3/4 time chord chart template"""
        template = """[Song Number]. [Song Title] ([Source/Book Reference])
Do = [Key]
Time Signature = 3/4
Tempo (1/4) = [Tempo] BPM
Structure = [Song Structure]

Intro : [Instructions/Instruments]
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |

Verse :
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |

Chorus :
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |
| [Chord] . . | [Chord] . . | [Chord] . . | [Chord] . . |

====== 3/4 TIME SIGNATURE ======
3 beats per measure: | C . . |
Example: | G . . | D . . | Em . . | C . . |"""
        
        self.original_text.delete('1.0', tk.END)
        self.original_text.insert('1.0', template)
        self.status_var.set("3/4 Time Template loaded")
    
    def load_template_4_4(self):
        """Load the 4/4 time chord chart template"""
        template = """[Song Number]. [Song Title] ([Source/Book Reference])
Do = [Key]
Time Signature = 4/4
Tempo (1/4) = [Tempo] BPM
Structure = [Song Structure]

Intro : [Instructions/Instruments]
| [Chord] . . . | [Chord] . . . | [Chord] . . . | [Chord] . . . |
| [Chord] . . . | [Chord] . . . | [Chord] . . . | [Chord] . . . |

Verse :
| [Chord] . . . | [Chord] . . . | [Chord] . . . | [Chord] . . . |
| [Chord] . . . | [Chord] . . . | [Chord] . . . | [Chord] . . . |

Chorus :
| [Chord] . . . | [Chord] . . . | [Chord] . . . | [Chord] . . . |
| [Chord] . . . | [Chord] . . . | [Chord] . . . | [Chord] . . . |

====== 4/4 TIME SIGNATURE ======
4 beats per measure: | C . . . |
Example: | G . . . | D . . . | Em . . . | C . . . |"""
        
        self.original_text.delete('1.0', tk.END)
        self.original_text.insert('1.0', template)
        self.status_var.set("4/4 Time Template loaded")
    
    def on_text_change(self, event=None):
        """Handle text changes in original text area"""
        # This method is no longer used but kept for compatibility
        pass
    
    def show_chord_guide(self):
        """Show chord notation guide"""
        guide = """CHORD NOTATION GUIDE

Basic Chords:
• Major: C, D, E (just the letter)
• Minor: Cm, Dm, Em
• 7th: C7, D7, E7
• Major 7th: CM7, DM7 (or Cmaj7)
• Minor 7th: Cm7, Dm7

Extended Chords:
• 9th: C9, Cm9, CM9
• 11th: C11, Cm11
• 13th: C13, Cm13

Altered Chords:
• Diminished: Cdim (or Co)
• Augmented: Caug (or C+)
• Half-diminished: Cm7b5
• Altered: C7#5, C7b5, C7#9, C7b9

Special Chords:
• Suspended: Csus4, Csus2
• Add chords: Cadd9, Cadd11
• Slash chords: C/E, G/B
• Power chords: C5

Valid Keys:
C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab, A, A#/Bb, B"""
        
        messagebox.showinfo("Chord Notation Guide", guide)
    
    def show_format_guide(self):
        """Show smart formatting guide"""
        guide = """SMART FORMATTING GUIDE

The Smart Format feature automatically:

1. **Aligns Bars**: Ensures all bar lines (|) are properly aligned
2. **Fixes Spacing**: Standardizes spacing between chords and beats
3. **Preserves Time Signatures**: 
   - 3/4 time: | C . . |
   - 4/4 time: | C . . . |

Features:
• **Smart Format Button**: Formats both original and transposed text
• **Format Original**: Formats only the original text
• **Format Transposed**: Formats only the transposed text
• **Align All Sections**: Aligns bars across multiple lines

Tips:
• Use Ctrl+F for quick smart formatting
• PDF export automatically applies formatting
• Templates are pre-formatted correctly

The formatter recognizes chord lines by:
- Presence of bar symbols (|)
- Chord notation (C, Dm, G7, etc.)
- Beat markers (dots)"""
        
        messagebox.showinfo("Smart Formatting Guide", guide)
    
    def convert_to_numbers(self):
        """Convert chord chart to numbered notation"""
        content = self.transposed_text.get('1.0', tk.END).rstrip()
        if not content:
            content = self.original_text.get('1.0', tk.END).rstrip()
        
        if not content:
            messagebox.showwarning("Warning", "No content to convert")
            return
        
        # Check if we have a key
        if not self.current_key:
            self.detect_key()
            if not self.current_key:
                messagebox.showwarning("Warning", "No key detected. Please ensure your chart has 'Do = X'")
                return
        
        try:
            use_roman = self.number_style_var.get() == "roman"
            converted = self.number_converter.convert_chart_to_numbers(content, use_roman)
            
            # Display in transposed text area
            self.transposed_text.delete('1.0', tk.END)
            self.transposed_text.insert('1.0', converted)
            
            style_name = "Roman numerals" if use_roman else "Arabic numbers"
            self.status_var.set(f"Converted to {style_name}")
            
        except Exception as e:
            messagebox.showerror("Error", f"Could not convert to numbers: {str(e)}")
    
    def convert_from_numbers(self):
        """Convert numbered notation back to chord symbols"""
        messagebox.showinfo("Info", "Converting from numbers back to chords requires knowing the original key.\nPlease use the transpose function with the desired target key.")
    
    def convert_to_numbers_style(self, style):
        """Convert to numbers with specific style from menu"""
        self.number_style_var.set(style)
        self.convert_to_numbers()
    
    def show_about(self):
        """Show about dialog"""
        about_text = """Chord Chart Transposer GUI
Smart Format Edition

Version 1.0

A graphical tool for transposing chord charts with automatic formatting.

Features:
• Transpose to any key
• Smart bar alignment
• Automatic spacing correction
• PDF export with formatting
• Side-by-side comparison
• Supports complex chord notation
• Nashville Number System conversion

Smart Format ensures your chord charts are:
- Properly aligned
- Consistently spaced
- Easy to read
- Professional looking

Number System:
- Roman numerals (I, ii, iii, IV, V, vi, vii°)
- Arabic numbers (1, 2m, 3m, 4, 5, 6m, 7dim)

© 2024"""
        
        messagebox.showinfo("About", about_text)


def main():
    root = tk.Tk()
    app = ChordTransposerGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()