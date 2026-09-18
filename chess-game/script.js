(function () {
  "use strict";

  var game = new Chess();

  var PIECE_UNICODE = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" }
  };

  var PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  var boardEl = document.getElementById("board");
  var statusEl = document.getElementById("status");
  var moveListEl = document.getElementById("moveList");
  var capByWhiteEl = document.getElementById("capByWhite");
  var capByBlackEl = document.getElementById("capByBlack");
  var undoBtn = document.getElementById("undoBtn");
  var resetBtn = document.getElementById("resetBtn");
  var flipBtn = document.getElementById("flipBtn");
  var vsComputerCheckbox = document.getElementById("vsComputer");
  var promoOverlay = document.getElementById("promoOverlay");
  var promoOptions = document.getElementById("promoOptions");

  var selectedSquare = null;
  var legalTargets = [];
  var lastMove = null;
  var flipped = false;
  var vsComputer = false;
  var computerColor = "b";
  var animating = false;

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
      setTimeout(function () {
        computerMove();
        animating = false;
      }, 350);
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
        var val = PIECE_VALUE[sq.type];
        score += sq.color === "w" ? val : -val;
      }
    }
    return score;
  }

  function minimax(depth, alpha, beta, maximizing) {
    if (depth === 0 || game.game_over()) {
      return evaluateBoard();
    }
    var moves = game.moves();
    if (maximizing) {
      var best = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        game.move(moves[i]);
        best = Math.max(best, minimax(depth - 1, alpha, beta, false));
        game.undo();
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      var worst = Infinity;
      for (var j = 0; j < moves.length; j++) {
        game.move(moves[j]);
        worst = Math.min(worst, minimax(depth - 1, alpha, beta, true));
        game.undo();
        beta = Math.min(beta, worst);
        if (beta <= alpha) break;
      }
      return worst;
    }
  }

  function computerMove() {
    var moves = game.moves();
    if (moves.length === 0) return;

    var maximizing = computerColor === "w";
    var bestScore = maximizing ? -Infinity : Infinity;
    var bestMoves = [];

    for (var i = 0; i < moves.length; i++) {
      game.move(moves[i]);
      var score = minimax(2, -Infinity, Infinity, !maximizing);
      game.undo();

      if (maximizing ? score > bestScore : score < bestScore) {
        bestScore = score;
        bestMoves = [moves[i]];
      } else if (score === bestScore) {
        bestMoves.push(moves[i]);
      }
    }

    var chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    var verboseMoves = game.moves({ verbose: true });
    var chosenVerbose = verboseMoves.filter(function (m) {
      return (m.san === chosen);
    })[0];

    game.move(chosen);
    if (chosenVerbose) {
      lastMove = { from: chosenVerbose.from, to: chosenVerbose.to };
    }
    afterMove();
  }

  function resetGame() {
    game.reset();
    selectedSquare = null;
    legalTargets = [];
    lastMove = null;
    animating = false;
    renderAll();

    if (vsComputer && game.turn() === computerColor) {
      animating = true;
      setTimeout(function () {
        computerMove();
        animating = false;
      }, 300);
    }
  }

  undoBtn.addEventListener("click", function () {
    if (animating) return;
    game.undo();
    if (vsComputer) game.undo();
    clearSelection();
    lastMove = null;
    renderAll();
  });

  resetBtn.addEventListener("click", resetGame);

  flipBtn.addEventListener("click", function () {
    flipped = !flipped;
    renderBoard();
  });

  vsComputerCheckbox.addEventListener("change", function () {
    vsComputer = vsComputerCheckbox.checked;
    computerColor = "b";
    resetGame();
  });

  renderAll();
})();
