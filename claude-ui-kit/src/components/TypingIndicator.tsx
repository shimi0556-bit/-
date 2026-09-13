export function TypingIndicator() {
  return (
    <div className="cui-typing" role="status" aria-label="Claude is thinking">
      <span className="cui-typing__dot" />
      <span className="cui-typing__dot" />
      <span className="cui-typing__dot" />
    </div>
  );
}
