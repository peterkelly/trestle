(letrec
    ((check-number
      (lambda (n)
        (if (!= (mod n 3) 0)
            #t
            (throw "bad!!"))))
     (loop
      (lambda (n max)
        (if (> n max)
            #t
            (begin
              (display "n = ")
              (display n)
              (try
               (check-number n)
               (lambda (e)
                 (display "Exception: ")
                 (display e)))
              (newline)
              (loop (+ n 1) max))))))
  (loop 1 10))
