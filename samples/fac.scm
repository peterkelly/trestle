(letrec
    ((fac (lambda (n)
            (if (eqv? n 1)
                1
                (* n (fac (- n 1)))))))
  (fac 5))
