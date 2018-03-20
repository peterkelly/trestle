(letrec
    ((loop
      (lambda (from to)
        (if (<= from to)
            (begin
              (if (and (eqv? (mod from 3) 0) (eqv? (mod from 5) 0))
                  (display "FizzBuzz\n")
                  (if (eqv? (mod from 3) 0)
                      (display "Fizz\n")
                      (if (eqv? (mod from 5) 0)
                          (display "Buzz\n")
                          (begin
                            (display from)
                            (newline)))))
              (loop (+ from 1) to))))))
  (loop 1 100))
