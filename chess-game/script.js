(function () {
  "use strict";

  var game = new Chess();

  var PIECE_UNICODE = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" }
  };

  var PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  var MATE_SCORE = 100000;
  var QUIESCENCE_DEPTH = 6;
  var MAX_SEARCH_DEPTH = 40;
  var TIME_UP = {};
  var DIFFICULTY_TIME_MS = { easy: 1000, medium: 4000, hard: 12000 };

  var PST = {
    p: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [50, 50, 50, 50, 50, 50, 50, 50],
      [10, 10, 20, 30, 30, 20, 10, 10],
      [5, 5, 10, 25, 25, 10, 5, 5],
      [0, 0, 0, 20, 20, 0, 0, 0],
      [5, -5, -10, 0, 0, -10, -5, 5],
      [5, 10, 10, -20, -20, 10, 10, 5],
      [0, 0, 0, 0, 0, 0, 0, 0]
    ],
    n: [
      [-50, -40, -30, -30, -30, -30, -40, -50],
      [-40, -20, 0, 0, 0, 0, -20, -40],
      [-30, 0, 10, 15, 15, 10, 0, -30],
      [-30, 5, 15, 20, 20, 15, 5, -30],
      [-30, 0, 15, 20, 20, 15, 0, -30],
      [-30, 5, 10, 15, 15, 10, 5, -30],
      [-40, -20, 0, 5, 5, 0, -20, -40],
      [-50, -40, -30, -30, -30, -30, -40, -50]
    ],
    b: [
      [-20, -10, -10, -10, -10, -10, -10, -20],
      [-10, 0, 0, 0, 0, 0, 0, -10],
      [-10, 0, 5, 10, 10, 5, 0, -10],
      [-10, 5, 5, 10, 10, 5, 5, -10],
      [-10, 0, 10, 10, 10, 10, 0, -10],
      [-10, 10, 10, 10, 10, 10, 10, -10],
      [-10, 5, 0, 0, 0, 0, 5, -10],
      [-20, -10, -10, -10, -10, -10, -10, -20]
    ],
    r: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [5, 10, 10, 10, 10, 10, 10, 5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [0, 0, 0, 5, 5, 0, 0, 0]
    ],
    q: [
      [-20, -10, -10, -5, -5, -10, -10, -20],
      [-10, 0, 0, 0, 0, 0, 0, -10],
      [-10, 0, 5, 5, 5, 5, 0, -10],
      [-5, 0, 5, 5, 5, 5, 0, -5],
      [0, 0, 5, 5, 5, 5, 0, -5],
      [-10, 5, 5, 5, 5, 5, 0, -10],
      [-10, 0, 5, 0, 0, 0, 0, -10],
      [-20, -10, -10, -5, -5, -10, -10, -20]
    ],
    k: [
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-20, -30, -30, -40, -40, -30, -30, -20],
      [-10, -20, -20, -20, -20, -20, -20, -10],
      [20, 20, 0, 0, 0, 0, 20, 20],
      [20, 30, 10, 0, 0, 10, 30, 20]
    ]
  };

  var boardEl = document.getElementById("board");
  var statusEl = document.getElementById("status");
  var moveListEl = document.getElementById("moveList");
  var capByWhiteEl = document.getElementById("capByWhite");
  var capByBlackEl = document.getElementById("capByBlack");
  var undoBtn = document.getElementById("undoBtn");
  var resetBtn = document.getElementById("resetBtn");
  var flipBtn = document.getElementById("flipBtn");
  var vsComputerCheckbox = document.getElementById("vsComputer");
  var colorChoiceRow = document.getElementById("colorChoiceRow");
  var playerColorSelect = document.getElementById("playerColor");
  var difficultySelect = document.getElementById("difficulty");
  var searchDepthInfoEl = document.getElementById("searchDepthInfo");
  var promoOverlay = document.getElementById("promoOverlay");
  var promoOptions = document.getElementById("promoOptions");

  var selectedSquare = null;
  var legalTargets = [];
  var lastMove = null;
  var flipped = false;
  var vsComputer = false;
  var computerColor = "b";
  var animating = false;
  var baseStatusText = "";

  var FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  var RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

  function squareId(file, rank) {
    return file + rank;
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    var files = flipped ? FILES.slice().reverse() : FILES;
    var ranks = flipped ? RANKS.slice().reverse() : RANKS;

    for (var r = 0; r < ranks.length; r++) {
      for (var f = 0; f < files.length; f++) {
        var file = files[f];
        var rank = ranks[r];
        var sq = squareId(file, rank);
        var fileIdx = FILES.indexOf(file);
        var rankIdx = RANKS.indexOf(rank);
        var isLight = (fileIdx + rankIdx) % 2 === 0;

        var div = document.createElement("div");
        div.className = "square " + (isLight ? "light" : "dark");
        div.dataset.square = sq;

        if (selectedSquare === sq) div.classList.add("selected");
        if (lastMove && (lastMove.from === sq || lastMove.to === sq)) {
          div.classList.add("last-move");
        }

        var piece = game.get(sq);
        if (piece) {
          var span = document.createElement("span");
          span.className = "piece " + (piece.color === "w" ? "white" : "black");
          span.textContent = PIECE_UNICODE[piece.color][piece.type];
          div.appendChild(span);

          if (piece.type === "k" && piece.color === game.turn() && game.in_check()) {
            div.classList.add("in-check");
          }
        }

        if (legalTargets.indexOf(sq) !== -1) {
          var marker = document.createElement("span");
          marker.className = piece ? "ring" : "dot";
          div.appendChild(marker);
        }

        if (f === 0) {
          var rankLabel = document.createElement("span");
          rankLabel.className = "coord rank";
          rankLabel.textContent = rank;
          div.appendChild(rankLabel);
        }
        if (r === ranks.length - 1) {
          var fileLabel = document.createElement("span");
          fileLabel.className = "coord file";
          fileLabel.textContent = file;
          div.appendChild(fileLabel);
        }

        div.addEventListener("click", onSquareClick);
        boardEl.appendChild(div);
      }
    }
  }

  function onSquareClick(e) {
    if (animating) return;
    if (vsComputer && game.turn() === computerColor) return;

    var sq = e.currentTarget.dataset.square;

    if (selectedSquare) {
      if (legalTargets.indexOf(sq) !== -1) {
        attemptMove(selectedSquare, sq);
        return;
      }
      var piece = game.get(sq);
      if (piece && piece.color === game.turn()) {
        selectSquare(sq);
      } else {
        clearSelection();
        renderBoard();
      }
      return;
    }

    var clicked = game.get(sq);
    if (clicked && clicked.color === game.turn()) {
      selectSquare(sq);
    }
  }

  function selectSquare(sq) {
    selectedSquare = sq;
    var moves = game.moves({ square: sq, verbose: true });
    legalTargets = moves.map(function (m) { return m.to; });
    renderBoard();
  }

  function clearSelection() {
    selectedSquare = null;
    legalTargets = [];
  }

  function attemptMove(from, to) {
    var moves = game.moves({ square: from, verbose: true });
    var candidate = moves.filter(function (m) { return m.to === to; });
    var needsPromotion = candidate.some(function (m) { return m.flags.indexOf("p") !== -1; });

    if (needsPromotion) {
      showPromotionModal(function (piece) {
        makeMove(from, to, piece);
      });
      return;
    }

    makeMove(from, to);
  }

  function makeMove(from, to, promotion) {
    var move = game.move({ from: from, to: to, promotion: promotion || "q" });
    if (!move) return;

    lastMove = { from: from, to: to };
    clearSelection();
    afterMove();

    if (vsComputer && !game.game_over() && game.turn() === computerColor) {
      animating = true;
      renderAll();
      setTimeout(triggerComputerMove, 350);
    }
  }

  function showPromotionModal(callback) {
    promoOptions.innerHTML = "";
    var color = game.turn();
    ["q", "r", "b", "n"].forEach(function (type) {
      var btn = document.createElement("button");
      btn.textContent = PIECE_UNICODE[color][type];
      btn.addEventListener("click", function () {
        promoOverlay.classList.remove("open");
        callback(type);
      });
      promoOptions.appendChild(btn);
    });
    promoOverlay.classList.add("open");
  }

  function afterMove() {
    renderAll();
  }

  function renderAll() {
    renderBoard();
    renderStatus();
    renderMoveList();
    renderCaptured();
  }

  function renderStatus() {
    var text;
    if (game.in_checkmate()) {
      var winner = game.turn() === "w" ? "שחור" : "לבן";
      text = "שח מט! " + winner + " ניצח";
    } else if (game.in_stalemate()) {
      text = "תיקו - פת (Stalemate)";
    } else if (game.in_threefold_repetition()) {
      text = "תיקו - חזרה משולשת";
    } else if (game.insufficient_material()) {
      text = "תיקו - חומר לא מספיק";
    } else if (game.in_draw()) {
      text = "תיקו";
    } else {
      var turnLabel = game.turn() === "w" ? "לבן" : "שחור";
      text = "תור ה" + turnLabel;
      if (game.in_check()) text += " - שח!";
    }
    baseStatusText = text;
    statusEl.textContent = text;
  }

  function renderMoveList() {
    var history = game.history();
    moveListEl.innerHTML = "";
    for (var i = 0; i < history.length; i += 2) {
      var li = document.createElement("li");
      var whiteMove = history[i] || "";
      var blackMove = history[i + 1] || "";
      li.textContent = whiteMove + (blackMove ? "   " + blackMove : "");
      moveListEl.appendChild(li);
    }
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function renderCaptured() {
    var history = game.history({ verbose: true });
    var byWhite = [];
    var byBlack = [];
    history.forEach(function (m) {
      if (m.captured) {
        var capturedColor = m.color === "w" ? "b" : "w";
        var symbol = PIECE_UNICODE[capturedColor][m.captured];
        if (m.color === "w") byWhite.push(symbol);
        else byBlack.push(symbol);
      }
    });
    capByWhiteEl.textContent = byWhite.join(" ");
    capByBlackEl.textContent = byBlack.join(" ");
  }

  function evaluateBoard() {
    var board = game.board();
    var score = 0;
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var sq = board[r][c];
        if (!sq) continue;
        var pstRow = sq.color === "w" ? r : 7 - r;
        var value = PIECE_VALUE[sq.type] + PST[sq.type][pstRow][c];
        score += sq.color === "w" ? value : -value;
      }
    }
    return score;
  }

  function moveScore(m) {
    var score = 0;
    if (m.captured) score += 10 * PIECE_VALUE[m.captured] - PIECE_VALUE[m.piece];
    if (m.promotion) score += PIECE_VALUE[m.promotion];
    return score;
  }

  function orderedMoves() {
    var moves = game.moves({ verbose: true });
    moves.sort(function (a, b) { return moveScore(b) - moveScore(a); });
    return moves;
  }

  var searchStartTime = 0;
  var searchNodeCount = 0;
  var searchTimeBudget = 3000;

  function checkTime() {
    searchNodeCount++;
    if ((searchNodeCount & 1023) === 0 && Date.now() - searchStartTime > searchTimeBudget) {
      throw TIME_UP;
    }
  }

  function quiescence(alpha, beta, maximizing, qDepth) {
    checkTime();
    var standPat = evaluateBoard();
    if (qDepth <= 0) return standPat;

    if (maximizing) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    } else {
      if (standPat <= alpha) return alpha;
      if (standPat < beta) beta = standPat;
    }

    var captures = game.moves({ verbose: true }).filter(function (m) { return m.captured; });
    captures.sort(function (a, b) { return moveScore(b) - moveScore(a); });

    for (var i = 0; i < captures.length; i++) {
      game.move(captures[i].san);
      try {
        var score = quiescence(alpha, beta, !maximizing, qDepth - 1);
        if (maximizing) {
          if (score > alpha) alpha = score;
          if (alpha >= beta) return beta;
        } else {
          if (score < beta) beta = score;
          if (beta <= alpha) return alpha;
        }
      } finally {
        game.undo();
      }
    }

    return maximizing ? alpha : beta;
  }

  function minimax(depth, alpha, beta, maximizing) {
    checkTime();
    if (game.in_checkmate()) {
      return game.turn() === "w" ? -MATE_SCORE - depth : MATE_SCORE + depth;
    }
    if (game.in_stalemate() || game.in_draw() || game.in_threefold_repetition()) {
      return 0;
    }
    if (depth === 0) {
      return quiescence(alpha, beta, maximizing, QUIESCENCE_DEPTH);
    }

    var moves = orderedMoves();
    if (maximizing) {
      var best = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        game.move(moves[i].san);
        try {
          best = Math.max(best, minimax(depth - 1, alpha, beta, false));
          alpha = Math.max(alpha, best);
        } finally {
          game.undo();
        }
        if (beta <= alpha) break;
      }
      return best;
    } else {
      var worst = Infinity;
      for (var j = 0; j < moves.length; j++) {
        game.move(moves[j].san);
        try {
          worst = Math.min(worst, minimax(depth - 1, alpha, beta, true));
          beta = Math.min(beta, worst);
        } finally {
          game.undo();
        }
        if (beta <= alpha) break;
      }
      return worst;
    }
  }

  // Iterative deepening: searches depth 1, then 2, then 3... within a wall-clock
  // time budget, always keeping the best move from the last depth that finished
  // completely. This is how every real chess engine (Stockfish included) paces
  // itself — none of them search a fixed number of plies, let alone a uniform
  // "100 moves ahead", since the search tree grows exponentially with depth.
  function iterativeSearch(timeBudgetMs) {
    searchStartTime = Date.now();
    searchNodeCount = 0;
    searchTimeBudget = timeBudgetMs;

    var maximizing = computerColor === "w";
    var bestMove = null;
    var depthReached = 0;

    for (var depth = 1; depth <= MAX_SEARCH_DEPTH; depth++) {
      var localBestMove = null;
      var localBestScore = maximizing ? -Infinity : Infinity;
      var aborted = false;

      try {
        var moves = orderedMoves();
        if (moves.length === 0) break;

        for (var i = 0; i < moves.length; i++) {
          game.move(moves[i].san);
          try {
            var score = minimax(depth - 1, -Infinity, Infinity, !maximizing);
            if (maximizing ? score > localBestScore : score < localBestScore) {
              localBestScore = score;
              localBestMove = moves[i];
            }
          } finally {
            game.undo();
          }
        }
      } catch (err) {
        if (err === TIME_UP) {
          aborted = true;
        } else {
          throw err;
        }
      }

      if (aborted || !localBestMove) break;

      bestMove = localBestMove;
      depthReached = depth;

      if (Math.abs(localBestScore) > MATE_SCORE - 1000) break;
    }

    return { move: bestMove, depth: depthReached };
  }

  function triggerComputerMove() {
    animating = true;
    statusEl.textContent = baseStatusText + " · המחשב חושב…";

    setTimeout(function () {
      var timeBudget = DIFFICULTY_TIME_MS[difficultySelect.value] || DIFFICULTY_TIME_MS.medium;
      var result = iterativeSearch(timeBudget);
      var chosen = result.move;

      if (!chosen) {
        var fallback = orderedMoves();
        chosen = fallback[0];
      }

      if (chosen) {
        game.move(chosen.san);
        lastMove = { from: chosen.from, to: chosen.to };
      }

      if (result.depth) {
        searchDepthInfoEl.textContent = "עומק חיפוש אחרון: " + result.depth + " מהלכים קדימה";
      }

      animating = false;
      afterMove();
    }, 30);
  }

  function resetGame() {
    game.reset();
    selectedSquare = null;
    legalTargets = [];
    lastMove = null;
    animating = false;
    searchDepthInfoEl.textContent = "";
    renderAll();

    if (vsComputer && game.turn() === computerColor) {
      setTimeout(triggerComputerMove, 300);
    }
  }

  undoBtn.addEventListener("click", function () {
    if (animating) return;
    game.undo();
    if (vsComputer) game.undo();
    clearSelection();
    lastMove = null;
    renderAll();

    if (vsComputer && !game.game_over() && game.turn() === computerColor) {
      setTimeout(triggerComputerMove, 300);
    }
  });

  resetBtn.addEventListener("click", resetGame);

  flipBtn.addEventListener("click", function () {
    flipped = !flipped;
    renderBoard();
  });

  vsComputerCheckbox.addEventListener("change", function () {
    vsComputer = vsComputerCheckbox.checked;
    colorChoiceRow.hidden = !vsComputer;
    computerColor = playerColorSelect.value === "w" ? "b" : "w";
    flipped = playerColorSelect.value === "b";
    resetGame();
  });

  playerColorSelect.addEventListener("change", function () {
    computerColor = playerColorSelect.value === "w" ? "b" : "w";
    flipped = playerColorSelect.value === "b";
    if (vsComputer) resetGame();
  });

  renderAll();
})();
