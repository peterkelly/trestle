(letrec
    ((loop
      (lambda (n)
        (if (<= n 10)
            (begin
              (display "n = ")
              (display n)
              (newline)
              (loop (+ n 1)))))))
  (loop 1))
