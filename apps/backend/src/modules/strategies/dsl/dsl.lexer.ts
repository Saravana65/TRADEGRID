import { Token, TokenType, KEYWORDS, SERIES_KEYWORDS } from './dsl.tokens';

export class DSLSyntaxError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly code: string = 'SYNTAX_ERROR'
  ) {
    super(`${message} (line ${line}, col ${column})`);
    this.name = 'DSLSyntaxError';
  }
}

export class DSLLexer {
  private source: string;
  private cursor: number = 0;
  private line: number = 1;
  private column: number = 1;
  private length: number;

  constructor(source: string) {
    this.source = source;
    this.length = source.length;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      const char = this.peek();

      // 1. Whitespace (except newlines)
      if (char === ' ' || char === '\t' || char === '\r') {
        this.advance();
        continue;
      }

      // 2. Newlines (significant for statement separation)
      if (char === '\n') {
        const line = this.line;
        const col = this.column;
        this.advance();
        // Collapse consecutive newlines
        if (tokens.length > 0 && tokens[tokens.length - 1].type !== 'NEWLINE') {
          tokens.push({ type: 'NEWLINE', value: '\n', line, column: col });
        }
        continue;
      }

      // 3. Comments (// or #)
      if (char === '#' || (char === '/' && this.peekNext() === '/')) {
        this.skipLineComment();
        continue;
      }

      // 4. String Literals ("..." or '...')
      if (char === '"' || char === "'") {
        tokens.push(this.scanString(char));
        continue;
      }

      // 5. Numbers and Percentages
      if (this.isDigit(char) || (char === '.' && this.isDigit(this.peekNext()))) {
        tokens.push(this.scanNumber());
        continue;
      }

      // 6. Two-character operators
      if (char === '=' && this.peekNext() === '=') {
        const line = this.line;
        const col = this.column;
        this.advance();
        this.advance();
        tokens.push({ type: 'EQ', value: '==', line, column: col });
        continue;
      }

      if (char === '!' && this.peekNext() === '=') {
        const line = this.line;
        const col = this.column;
        this.advance();
        this.advance();
        tokens.push({ type: 'NEQ', value: '!=', line, column: col });
        continue;
      }

      if (char === '>' && this.peekNext() === '=') {
        const line = this.line;
        const col = this.column;
        this.advance();
        this.advance();
        tokens.push({ type: 'GTE', value: '>=', line, column: col });
        continue;
      }

      if (char === '<' && this.peekNext() === '=') {
        const line = this.line;
        const col = this.column;
        this.advance();
        this.advance();
        tokens.push({ type: 'LTE', value: '<=', line, column: col });
        continue;
      }

      // 7. Single-character symbols and operators
      const line = this.line;
      const col = this.column;
      switch (char) {
        case '=':
          this.advance();
          tokens.push({ type: 'ASSIGN', value: '=', line, column: col });
          continue;
        case ':':
          this.advance();
          tokens.push({ type: 'COLON', value: ':', line, column: col });
          continue;
        case ',':
          this.advance();
          tokens.push({ type: 'COMMA', value: ',', line, column: col });
          continue;
        case '(':
          this.advance();
          tokens.push({ type: 'LPAREN', value: '(', line, column: col });
          continue;
        case ')':
          this.advance();
          tokens.push({ type: 'RPAREN', value: ')', line, column: col });
          continue;
        case '+':
          this.advance();
          tokens.push({ type: 'PLUS', value: '+', line, column: col });
          continue;
        case '-':
          this.advance();
          tokens.push({ type: 'MINUS', value: '-', line, column: col });
          continue;
        case '*':
          this.advance();
          tokens.push({ type: 'MULTIPLY', value: '*', line, column: col });
          continue;
        case '/':
          this.advance();
          tokens.push({ type: 'DIVIDE', value: '/', line, column: col });
          continue;
        case '>':
          this.advance();
          tokens.push({ type: 'GT', value: '>', line, column: col });
          continue;
        case '<':
          this.advance();
          tokens.push({ type: 'LT', value: '<', line, column: col });
          continue;
      }

      // 8. Identifiers and Keywords
      if (this.isAlpha(char) || char === '_') {
        tokens.push(this.scanIdentifier());
        continue;
      }

      throw new DSLSyntaxError(`Unexpected character '${char}'`, this.line, this.column);
    }

    // Clean trailing newlines before EOF
    while (tokens.length > 0 && tokens[tokens.length - 1].type === 'NEWLINE') {
      tokens.pop();
    }

    tokens.push({ type: 'EOF', value: '', line: this.line, column: this.column });
    return tokens;
  }

  private advance(): string {
    const char = this.source[this.cursor];
    this.cursor++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.cursor];
  }

  private peekNext(): string {
    if (this.cursor + 1 >= this.length) return '\0';
    return this.source[this.cursor + 1];
  }

  private isAtEnd(): boolean {
    return this.cursor >= this.length;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char) || char === '_';
  }

  private skipLineComment(): void {
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }
  }

  private scanString(quoteChar: string): Token {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // consume opening quote

    let val = '';
    while (!this.isAtEnd() && this.peek() !== quoteChar) {
      if (this.peek() === '\n') {
        throw new DSLSyntaxError('Unterminated string literal across newline', startLine, startCol);
      }
      if (this.peek() === '\\') {
        this.advance(); // escape
        const escaped = this.advance();
        if (escaped === 'n') val += '\n';
        else if (escaped === 't') val += '\t';
        else if (escaped === '\\') val += '\\';
        else if (escaped === quoteChar) val += quoteChar;
        else val += escaped;
      } else {
        val += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new DSLSyntaxError('Unterminated string literal at end of file', startLine, startCol);
    }

    this.advance(); // consume closing quote
    return { type: 'STRING', value: val, line: startLine, column: startCol };
  }

  private scanNumber(): Token {
    const startLine = this.line;
    const startCol = this.column;
    let numStr = '';

    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      numStr += this.advance();
    }

    // Decimal part
    if (!this.isAtEnd() && this.peek() === '.' && this.isDigit(this.peekNext())) {
      numStr += this.advance(); // '.'
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        numStr += this.advance();
      }
    }

    // Percentage suffix (%)
    if (!this.isAtEnd() && this.peek() === '%') {
      this.advance();
      return { type: 'PERCENT', value: numStr, line: startLine, column: startCol };
    }

    return { type: 'NUMBER', value: numStr, line: startLine, column: startCol };
  }

  private scanIdentifier(): Token {
    const startLine = this.line;
    const startCol = this.column;
    let ident = '';

    while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
      ident += this.advance();
    }

    const lower = ident.toLowerCase();

    // Check built-in series
    if (SERIES_KEYWORDS.has(lower)) {
      return { type: 'SERIES', value: lower, line: startLine, column: startCol };
    }

    // Check keywords (ensure prototype properties like __proto__ aren't treated as keywords)
    if (Object.prototype.hasOwnProperty.call(KEYWORDS, lower)) {
      const keywordType = KEYWORDS[lower];
      return { type: keywordType, value: lower, line: startLine, column: startCol };
    }

    return { type: 'IDENTIFIER', value: ident, line: startLine, column: startCol };
  }
}
