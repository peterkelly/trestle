(letrec
    (
     (odd? (lambda (n) (== (% n 2) 1)))
     (even? (lambda (n) (== (% n 2) 0)))
     )
  (odd? 5))
