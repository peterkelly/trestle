(letrec
    ((fac (lambda (n)
            (if (== n 1)
                1
                (* n (fac (- n 1)))))))
  (fac 5)
  (display "test")
  (newline))
